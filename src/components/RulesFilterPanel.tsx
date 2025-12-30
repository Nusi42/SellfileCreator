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
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import { metasetGlyph, orderMetasetIds, type Metaset } from '../lib/metasets'
import React from 'react'
import { alpha, useTheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import { keyframes } from '@emotion/react'
import { useGearSetCatalogVersion } from '../hooks/useGearSetCatalogVersion'
import { RULES_FILTER_COLLAPSIBLE_SECTION_IDS } from '../state/rulesFilterPersistence'
import type { CollapsedSections } from '../state/rulesFilterPersistence'
import {
  DEFAULT_RULES_FILTER_STATE,
  TESTER_LEVEL_MAX,
  TESTER_LEVEL_MIN,
  TESTER_ROLL_COUNT_VALUES,
  TESTER_LAST_USE_MAX_DAYS,
  TESTER_LAST_USE_MIN_DAYS,
  createDefaultTesterLastUseCustom,
  createDefaultTesterLastUseFilter,
  createDefaultTesterRollsState,
  isTesterRollFilterActive,
  normalizeTesterLastUseFilter,
  normalizeTesterRollCountSelection,
  resolveTesterLevelRange,
  sanitizeRulesFilterState,
  type AnyMode,
  type Bool3,
  type RulesFilterState,
  type TesterChaosFilterMode,
  type TesterGlyphFilterMode,
  type TesterLastUsePreset,
  type TesterLastUseCustomFilter,
  type TesterRollCountSet,
  type TesterRollCountValue,
  type TesterRollFilterRow,
  type TesterRollFilterState,
  type TesterRollWildcardMode,
  type TesterSourceFilter,
  toggleTesterLastUsePresetSelection,
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
import { TESTER_CONFIG_FILTER_MODE_DEFAULT, type TesterConfigFilterMode } from '../types/testerConfigFilterMode'
import type { ChampionLocation } from '../lib/importers/gearDbNormalizer'
import type { SubstatColorMap } from '../lib/renderColoredStatText'
import { computeInlineSelectContentMaxWidth, computeInlineSelectPadding } from '../lib/inlineSelectAffordances'
import { championIconUrl } from '../lib/iconMaps/championIconMap'
import { resolveRarityAccentColor } from '../lib/rarityColors'

// Filter options bundle metadata for consistent champion icons + rarity borders.
type TesterChampionOption = {
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
// Keep the closed combobox width aligned with the rest of the filter row.
const CHAMPION_SELECT_WIDTH_PX = Math.round(FILTER_FACTION_SELECT_WIDTH_PX * 0.8)
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
  focusConfigNameInput: (options?: { selectText?: boolean }) => boolean
}

type RulesFilterPanelProps = {
  mode?: 'rules' | 'tester'
  state: RulesFilterState
  onChange: (next: RulesFilterState) => void
  metasets: Metaset[]
  showFaction: boolean
  configChipFilterActive: boolean
  onConfigChipFilterChange: (value: boolean) => void
  testerConfigFilterMode?: TesterConfigFilterMode
  onTesterConfigFilterModeChange?: (mode: TesterConfigFilterMode) => void
  configCount?: number
  collapsed: CollapsedSections
  onCollapsedChange: (next: CollapsedSections) => void
  testerChampionOptions?: TesterChampionOption[]
  substatColors?: SubstatColorMap
  useStatButtonColors?: boolean
  hasManualTesterItems?: boolean
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

const TOGGLE_BUTTON_BORDER_RADIUS = `${STATUS_CHIP_BORDER_RADIUS_PX}px`
const toggleBorderColor = (theme: Theme) => theme.palette.divider
// Grid-based toggle groups rely on real spacing, so restore each chip's outline.
const GRID_TOGGLE_BUTTON_GROUP_SX: SxProps<Theme> = (theme) => {
  const borderColor = toggleBorderColor(theme)
  return {
    '& .MuiToggleButtonGroup-grouped': {
      margin: '0 !important',
      borderRadius: TOGGLE_BUTTON_BORDER_RADIUS,
      borderColor,
    },
    '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
      marginLeft: '0 !important',
      borderLeft: `1px solid ${borderColor}`,
    },
  }
}
// Segmented toggles sit flush; keep the fused seam while matching the neutral border color.
const SEGMENTED_TOGGLE_BUTTON_GROUP_SX: SxProps<Theme> = (theme) => {
  const borderColor = toggleBorderColor(theme)
  return {
    display: 'inline-flex',
    columnGap: 0.5,
    rowGap: 0,
    '& .MuiToggleButtonGroup-grouped': {
      margin: '0 !important',
      borderRadius: TOGGLE_BUTTON_BORDER_RADIUS,
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
      display: 'inline-flex',
      flexWrap: 'wrap',
      columnGap: 0.5,
      rowGap: 0.5,
      '& .MuiToggleButton-root': {
        p: 0.5,
        ...(minWidth != null ? { minWidth } : {}),
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

const SectionHeaderLabel = ({ label }: { label: string }) => (
  <EllipsisTooltip title={label} wrap="block">
    <FormLabel sx={sectionHeaderLabelSx}>
      <Box component="span" data-ellipsis-target sx={sectionHeaderLabelTextSx}>
        {label}
      </Box>
    </FormLabel>
  </EllipsisTooltip>
)

const ZERO_RESULTS_PULSE = keyframes`
  0%, 100% { background-color: rgba(0,0,0,0); }
  60% { background-color: rgba(244, 67, 54, 0.28); }
`

const EMPTY_ROLL_ROWS: readonly TesterRollFilterRow[] = []
const ROLL_COUNT_LABELS: Record<TesterRollCountValue, string> = {
  0: GLYPH_NOT_REROLLED,
  1: '1',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
}

const ROLL_COUNT_TOGGLE_SIZE_PX = Math.round(ROLL_BADGE_SIZE_PX * ROLL_BADGE_SCALE)

const rollCountToggleGroupSx: SxProps<Theme> = (theme) => {
  const highlight = theme.palette.success.main
  const selectedText = theme.palette.common.white
  const baseBorder = alpha(theme.palette.text.primary, 0.45)
  const hoverGlow = alpha(
    theme.palette.text.primary,
    theme.palette.mode === 'dark' ? 0.22 : 0.14,
  )
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${TESTER_ROLL_COUNT_VALUES.length}, ${ROLL_COUNT_TOGGLE_SIZE_PX}px)`,
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
      color: theme.palette.text.secondary,
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
      backgroundColor: theme.palette.action.hover,
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

const sortTesterRollRows = (rows: readonly TesterRollFilterRow[]): TesterRollFilterRow[] => (
  [...rows].sort((a, b) => {
    const left = STAT_VARIANT_ORDER_LOOKUP.get(Number(a.stat)) ?? 0
    const right = STAT_VARIANT_ORDER_LOOKUP.get(Number(b.stat)) ?? 0
    return left - right
  })
)

const summarizeRollCounts = (counts: TesterRollCountSet): string => {
  if (!counts || counts.length === 0) return ''
  return `{${counts.map((value) => ROLL_COUNT_LABELS[value]).join(', ')}}`
}
const EMPTY_TESTER_ROLL_COUNT_SET: TesterRollCountSet = []
const rollSetCoversAllCounts = (counts: TesterRollCountSet): boolean => {
  if (counts.length !== TESTER_ROLL_COUNT_VALUES.length) return false
  return TESTER_ROLL_COUNT_VALUES.every((value, index) => counts[index] === value)
}

// UI-only component that lets users filter the preview table. View-only; export ignores filters.
const RulesFilterPanel = React.forwardRef<RulesFilterPanelHandle, RulesFilterPanelProps>(function RulesFilterPanel(
  {
    mode = 'rules',
    state: rawState,
    onChange,
    metasets,
    showFaction,
  configChipFilterActive,
  onConfigChipFilterChange,
  testerConfigFilterMode = TESTER_CONFIG_FILTER_MODE_DEFAULT,
  onTesterConfigFilterModeChange,
  configCount = 0,
  collapsed,
  onCollapsedChange,
    testerChampionOptions = [],
    substatColors,
    useStatButtonColors = false,
    hasManualTesterItems = false,
  },
  ref,
) {
  // Why: persisted filter state can be partially-written or come from older builds; sanitize once per render
  // so the panel never crashes while computing `.length`/`.map` on required nested arrays.
  const state = React.useMemo(() => sanitizeRulesFilterState(rawState as unknown), [rawState])
  const isTesterMode = mode === 'tester'
  const { t, lang } = useI18n()
  useGearSetCatalogVersion()
  const theme = useTheme()
  const testerRollsState: TesterRollFilterState = state.testerRolls ?? DEFAULT_RULES_FILTER_STATE.testerRolls ?? createDefaultTesterRollsState()
  const testerRollsActive = isTesterRollFilterActive(state.testerRolls)
  const [testerRollsAnchorEl, setTesterRollsAnchorEl] = React.useState<HTMLElement | null>(null)
  const testerRollsPaperRef = React.useRef<HTMLDivElement | null>(null)
  const testerRollsOpen = Boolean(testerRollsAnchorEl)
  const handleTesterRollsClose = React.useCallback(() => {
    setTesterRollsAnchorEl(null)
  }, [])
  // Guard the tester rolls popover so outside clicks cannot leave a stuck overlay.
  const { contextMenuGuard: testerRollsGuard } = useContextMenuPaperGuard({
    open: testerRollsOpen,
    onClose: handleTesterRollsClose,
    menuRef: testerRollsPaperRef,
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
  const rollFilterStatOptions = React.useMemo(() => STAT_VARIANTS_PRIORITY.slice(), [])
  // Persisted Sets order + local search to mirror Builder UX
  const [setsOrder, setSetsOrder] = useSetsOrderPreference()
  const [setsSearch, setSetsSearch] = React.useState('')
  const configNameQuery = state.configName?.query ?? ''
  // Keep the header layout stable: the Config Name filter always renders so the action buttons stay left-aligned,
  // even when there are zero configs (or configs without names) loaded yet.
  const hasConfigs = configCount > 0
  const configNameInputRef = React.useRef<HTMLInputElement | null>(null)
  const configNameRegexError = React.useMemo(() => {
    if (!configNameQuery) return false
    try {
      void new RegExp(configNameQuery, 'i')
      return false
    } catch {
      return true
    }
  }, [configNameQuery])
  const handleConfigNameChange = React.useCallback((value: string) => {
    onChange({ ...state, configName: { query: value } })
  }, [onChange, state])
  const topHeaderRef = React.useRef<HTMLDivElement | null>(null)
  const focusConfigNameInput = React.useCallback((options?: { selectText?: boolean }) => {
    // Why: the config name field always renders now, so we only guard on the input being mounted and visible.
    const input = configNameInputRef.current
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
    focusConfigNameInput,
  }), [focusConfigNameInput])
  const [headerMaxHeight, setHeaderMaxHeight] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = topHeaderRef.current
    if (!el) return
    const height = el.offsetHeight
    setHeaderMaxHeight(prev => (height > prev ? height : prev || height))
  }, [configNameQuery])
  const setsSelectContainerRef = React.useRef<HTMLDivElement | null>(null)
  const setsMenuListRef = React.useRef<HTMLUListElement | null>(null)
  const metasetsMenuListRef = React.useRef<HTMLUListElement | null>(null)
  const [setsMenuOpen, setSetsMenuOpen] = React.useState(false)
  // Collapsible sections: persisted per user; default to collapsed to reduce scroll noise.
  // Per-section condensed toggles (persisted)
  // Rank/Rarity are always condensed now (More/Less removed)
  const SectionToggle = ({ id }: { id: keyof typeof collapsed }) => {
    const toggleSections = (applyToAll: boolean) => {
      const nextValue = !collapsed[id]
      if (applyToAll) {
        const nextAll: typeof collapsed = { ...collapsed }
        for (const key of RULES_FILTER_COLLAPSIBLE_SECTION_IDS) {
          nextAll[key] = nextValue
        }
        onCollapsedChange(nextAll)
        return
      }
      onCollapsedChange({ ...collapsed, [id]: nextValue })
    }
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      const multiToggle = event.ctrlKey || event.metaKey
      toggleSections(multiToggle)
    }
    const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      toggleSections(true)
    }
    return (
      <IconButton
        size="small"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        aria-label={collapsed[id] ? 'Expand' : 'Collapse'}
      >
        {collapsed[id] ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
      </IconButton>
    )
  }
  const tintedChipSx = React.useCallback((paletteColor: typeof theme.palette.success) => {
    const tone = theme.palette.mode === 'dark' ? paletteColor.light : paletteColor.dark
    const borderRadius = `${STATUS_CHIP_BORDER_RADIUS_PX}px`
    return {
      height: BUILDER_STATUS_CHIP_HEIGHT_PX,
      minHeight: BUILDER_STATUS_CHIP_HEIGHT_PX,
      fontWeight: theme.typography.fontWeightMedium ?? 500,
      px: 0,
      borderRadius,
      overflow: 'hidden',
      backgroundColor: alpha(paletteColor.main, 0.18),
      color: tone,
      '& .MuiChip-icon': {
        color: tone,
      },
      '& .MuiChip-label': {
        px: theme.spacing(0.75),
        fontWeight: theme.typography.fontWeightMedium ?? 500,
        borderRadius,
      },
      '&.MuiChip-clickable:hover': {
        backgroundColor: alpha(paletteColor.main, 0.24),
      },
      '&.MuiChip-clickable:active': {
        backgroundColor: alpha(paletteColor.main, 0.3),
      },
    }
  }, [theme])

  const filterChipSx = React.useCallback((mode: AnyMode) => {
    const paletteColor = mode === 'include' ? theme.palette.success : mode === 'off' ? theme.palette.warning : theme.palette.info
    return tintedChipSx(paletteColor)
  }, [theme, tintedChipSx])

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
  const wildcardState = testerRollsState.wildcard ?? createDefaultTesterRollsState().wildcard
  const wildcardCounts: TesterRollCountSet = React.useMemo(
    () => wildcardState.counts ?? [],
    [wildcardState.counts],
  )
  const wildcardIsActive = (wildcardState.mode ?? 'off') === 'any' && wildcardCounts.length > 0
  const wildcardDisplayCounts = wildcardIsActive ? wildcardCounts : EMPTY_TESTER_ROLL_COUNT_SET
  const testerRollsPerStat = testerRollsState.perStat ?? EMPTY_ROLL_ROWS
  const activePerStatRows = React.useMemo(
    () => testerRollsPerStat.filter((row) => (row.counts?.length ?? 0) > 0),
    [testerRollsPerStat],
  )
  const testerRollRowCount = activePerStatRows.length
  const perStatCounts = React.useMemo(() => {
    const map = new Map<number, TesterRollCountSet>()
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

    if (testerRollRowCount > 0) {
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
  }, [activePerStatRows, t, testerRollRowCount, wildcardCounts, wildcardIsActive])

  // SectionHeader pairs the toggle with an ellipsized label so every section handles long translations uniformly.
  const SectionHeader = ({
    id,
    label,
    actions,
    fullWidth = true,
    maxWidth,
	  }: {
	    id: keyof typeof collapsed
	    label: string
	    actions?: React.ReactNode
	    fullWidth?: boolean
	    maxWidth?: number | string
	  }) => {
    const resolvedMax = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth
    return (
      <Box
        sx={{
          ...sectionHeaderBaseSx,
          width: fullWidth ? '100%' : resolvedMax ?? 'fit-content',
          maxWidth: fullWidth ? '100%' : resolvedMax ?? '100%',
        }}
      >
        <SectionToggle id={id} />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            minWidth: 0,
            flex: '0 1 auto',
          }}
        >
          <SectionHeaderLabel label={label} />
          {actions ? (
            <Box sx={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
              {actions}
            </Box>
          ) : null}
        </Box>
      </Box>
    )
  }

  const rollChipGlyph = React.useMemo(() => {
    if (!testerRollsActive) return GLYPH_GTE_ZERO
    if (wildcardIsActive) return GLYPH_GLYPHS_ON
    if (testerRollRowCount > 0) return GLYPH_ONLY
    return GLYPH_GTE_ONE
  }, [testerRollRowCount, testerRollsActive, wildcardIsActive])

  const rollChipLabel = `${t('filterRolls')}: ${rollChipGlyph}`
  const rollChipAria = t('filterRollsChipAria', { summary: rollSummaryDescription })

  const applyTesterRollsChange = React.useCallback((mutator: (current: TesterRollFilterState) => TesterRollFilterState) => {
    const nextRolls = mutator(state.testerRolls ?? createDefaultTesterRollsState())
    if (!isTesterRollFilterActive(nextRolls) && nextRolls.wildcard.mode === 'off') {
      const { testerRolls: _ignored, ...rest } = state
      onChange(rest as RulesFilterState)
      return
    }
    onChange({
      ...state,
      testerRolls: nextRolls,
    })
  }, [onChange, state])

  const applyExclusiveRollsChange = React.useCallback((
    scope: 'wildcard' | 'perStat',
    mutator: (current: TesterRollFilterState) => TesterRollFilterState,
  ) => {
    applyTesterRollsChange((current) => {
      let next = mutator(current)
      if (scope === 'wildcard') {
        if (next.perStat.length > 0) {
          next = { ...next, perStat: [] }
        }
      } else {
        const wildcard = next.wildcard ?? createDefaultTesterRollsState().wildcard
        if ((wildcard.counts?.length ?? 0) > 0 || wildcard.mode !== 'off') {
          next = {
            ...next,
            wildcard: { ...wildcard, mode: 'off', counts: [] },
          }
        }
      }
      return next
    })
  }, [applyTesterRollsChange])

  const updateWildcardCounts = React.useCallback((updater: (current: TesterRollCountSet) => TesterRollCountSet) => {
    applyExclusiveRollsChange('wildcard', (current) => {
      const base = current.wildcard ?? createDefaultTesterRollsState().wildcard
      const seed = (base.mode ?? 'off') === 'any' ? base.counts ?? [] : EMPTY_TESTER_ROLL_COUNT_SET
      let counts = normalizeTesterRollCountSelection(updater([...seed]))
      const coversAll = rollSetCoversAllCounts(counts)
      if (coversAll) {
        counts = EMPTY_TESTER_ROLL_COUNT_SET
      }
      const nextMode: TesterRollWildcardMode = counts.length > 0 ? 'any' : 'off'
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

  const handleWildcardToggleValue = React.useCallback((value: TesterRollCountValue) => {
    updateWildcardCounts((current) => {
      const next = new Set(current ?? [])
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return normalizeTesterRollCountSelection(Array.from(next))
    })
  }, [updateWildcardCounts])

  const handleWildcardSelectNone = React.useCallback(() => {
    updateWildcardCounts(() => [])
  }, [updateWildcardCounts])

  const getPerStatCounts = React.useCallback((variant: StatVariant): TesterRollCountSet => (
    perStatCounts.get(Number(variant)) ?? []
  ), [perStatCounts])

  const handlePerStatCountsChange = React.useCallback((variant: StatVariant, counts: TesterRollCountSet) => {
    applyExclusiveRollsChange('perStat', (current) => {
      const perStat = current.perStat ?? []
      const filtered = perStat.filter((row) => Number(row.stat) !== Number(variant))
      const nextRows = counts.length > 0
        ? sortTesterRollRows([...filtered, { stat: variant, counts }])
        : filtered
      return {
        ...current,
        perStat: nextRows,
      }
    })
  }, [applyExclusiveRollsChange])

  const handlePerStatToggleValue = React.useCallback((variant: StatVariant, value: TesterRollCountValue) => {
    const currentCounts = perStatCounts.get(Number(variant)) ?? []
    const next = new Set(currentCounts)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    handlePerStatCountsChange(variant, normalizeTesterRollCountSelection(Array.from(next)))
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
  const orderedMetaSelected = orderMetasetIds(state.sets.metaSelected, orderBasis)
  const selectedSetTokens: string[] = [
    ...orderedMetaSelected.map((id) => `m:${id}`),
    ...state.sets.selected.map((id) => `s:${Number(id)}`),
  ]
  const setsRenderValue = (tokens: string[]) => {
    const names: string[] = []
    for (const tkn of tokens) {
      if (tkn.startsWith('m:')) {
        const id = tkn.slice(2)
        const meta = metasets.find(x => x.id === id)
        if (meta) {
          const { glyph, iconId } = metasetGlyph(meta)
          if (glyph != null && iconId) {
            const needsGap = iconId !== 'empty'
            names.push(`${glyph}${needsGap ? ` ${meta.name}` : meta.name}`)
          } else {
            names.push(meta.name)
          }
        }
      } else if (tkn.startsWith('s:')) {
        const id = Number(tkn.slice(2))
        const localized = getLocalizedGearSetName(id as ArtifactSetId, t, lang) || artifactSetName(id)
        names.push(localized)
      }
    }
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

  const testerLastUseFilter = React.useMemo(
    () => normalizeTesterLastUseFilter(state.testerLastUse),
    [state.testerLastUse],
  )
  const lastUsePresetSelection = testerLastUseFilter.presets
  const lastUseCustom = testerLastUseFilter.custom
  const dayShort = React.useMemo(() => {
    const raw = t('testerLastUsedDayShort')
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    return trimmed.length > 0 ? trimmed : 'd'
  }, [t])
  const lastUsePresetOptions = React.useMemo(() => {
    const labels: Record<TesterLastUsePreset, string> = {
      never: '∅',
      recent7: `≤7${dayShort}`,
      recent30: `≤30${dayShort}`,
      recent90: `≤90${dayShort}`,
      older90: `>90${dayShort}`,
    }
    return [
      { value: 'never', label: labels.never, tooltip: t('testerLastUsedPresetNever') },
      { value: 'recent7', label: labels.recent7, tooltip: t('testerLastUsedPreset7d') },
      { value: 'recent30', label: labels.recent30, tooltip: t('testerLastUsedPreset30d') },
      { value: 'recent90', label: labels.recent90, tooltip: t('testerLastUsedPreset90d') },
      { value: 'older90', label: labels.older90, tooltip: t('testerLastUsedPresetOlder90d') },
    ]
  }, [dayShort, t])
  const lastUseCustomSummary = React.useMemo(() => {
    if (!lastUseCustom.enabled) return null
    const parts: string[] = []
    const minActive = lastUseCustom.minDays > TESTER_LAST_USE_MIN_DAYS
    const maxActive = lastUseCustom.maxDays < TESTER_LAST_USE_MAX_DAYS
    if (minActive && maxActive) {
      parts.push(t('testerLastUsedCustomSummaryRange', { minDays: lastUseCustom.minDays, maxDays: lastUseCustom.maxDays }))
    } else if (minActive) {
      parts.push(t('testerLastUsedCustomSummaryMin', { minDays: lastUseCustom.minDays }))
    } else if (maxActive) {
      parts.push(t('testerLastUsedCustomSummaryMax', { maxDays: lastUseCustom.maxDays }))
    }
    const summary = parts.join(' • ')
    return summary || t('testerLastUsedCustomChipLabel')
  }, [lastUseCustom, t])

  const lastUseAdvancedLabel = lastUseCustomSummary ?? t('testerLastUsedAdvancedButton')

  const handleSetsChange = (e: SelectChangeEvent<string[]>) => {
    const tokens = e.target.value as string[]
    const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
    const metaIdsRaw = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
    const metaIds = orderMetasetIds(metaIdsRaw, orderBasis)
    onChange({ ...state, sets: { ...state.sets, selected: setIds, metaSelected: metaIds } })
  }
  const resetLastUseCustom = React.useCallback(() => {
    onChange({
      ...state,
      testerLastUse: normalizeTesterLastUseFilter({
        presets: testerLastUseFilter.presets,
        custom: { ...createDefaultTesterLastUseCustom(), enabled: false },
      }),
    })
  }, [onChange, state, testerLastUseFilter.presets])
  const applyLastUsePresets = React.useCallback((presets: TesterLastUsePreset[]) => {
    // Keep the custom range intact so users can stack presets + range without re-entering values.
    onChange({
      ...state,
      testerLastUse: normalizeTesterLastUseFilter({
        presets,
        custom: testerLastUseFilter.custom,
      }),
    })
  }, [onChange, state, testerLastUseFilter.custom])
  const applyLastUseCustom = React.useCallback((partial: Partial<TesterLastUseCustomFilter>) => {
    const merged: TesterLastUseCustomFilter = {
      ...testerLastUseFilter.custom,
      ...partial,
      enabled: true,
    }
    // Preserve preset selection while toggling the custom slider so both act as a union.
    onChange({
      ...state,
      testerLastUse: normalizeTesterLastUseFilter({
        presets: testerLastUseFilter.presets,
        custom: merged,
      }),
    })
  }, [onChange, state, testerLastUseFilter.custom, testerLastUseFilter.presets])
  const handleLastUsePopoverOpen = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    setLastUseAnchorEl(event.currentTarget as HTMLElement)
  }, [])
  const handleLastUseReset = React.useCallback(() => {
    resetLastUseCustom()
  }, [resetLastUseCustom])

  const handleLastUsePresetToggle = React.useCallback((preset: TesterLastUsePreset) => {
    // Collapse redundant recency choices whenever a button toggles so the selection stays meaningful.
    const nextSelection = toggleTesterLastUsePresetSelection(lastUsePresetSelection, preset)
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
    const fallback = field === 'minDays' ? TESTER_LAST_USE_MIN_DAYS : TESTER_LAST_USE_MAX_DAYS
    const payload: Partial<TesterLastUseCustomFilter> = field === 'minDays'
      ? { minDays: isValid ? parsed : fallback }
      : { maxDays: isValid ? parsed : fallback }
    applyLastUseCustom(payload)
  }, [applyLastUseCustom])
  const scrollSetsMenuToSelected = React.useCallback((orderOverride?: 'game' | 'az' | 'icons', opts?: { force?: boolean }) => {
    if (!opts?.force && !setsMenuOpen) return
    const order = orderOverride ?? setsOrder
    if (order === 'icons') return
    const list = setsMenuListRef.current
    if (!list) return
    const sortedForOrder = filterAndSortSetEntries(setsSearch, order, { translate: t })
    const selectedIds = new Set(state.sets.selected.map(Number))
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
  }, [setsMenuOpen, setsMenuListRef, setsOrder, setsSearch, state.sets.selected, t])

  // Slots — compact toggle buttons with icons/text
  const slotButtons = PREFERRED_ARTIFACT_TYPE_ORDER.map((tt) => ({ id: Number(tt), name: ((): string => {
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
  })() }))
  const selectedSlots = new Set(state.slots.selected.map(Number))

  // Rank/Rarity — sliders replaced with concise button rows for milestone ranges to keep UI compact
  // Rank/Rarity value constants not needed in condensed mode

  // Level buttons
  const levelValues: readonly LevelMilestone[] = LEVEL_MILESTONES
  const testerLevelRange = resolveTesterLevelRange(state.level)
  const testerLevelSliderMarks = levelValues.map((value) => ({ value, label: `+${value}` }))
  const levelControlWidthPx = levelValues.length * 36
  const levelControlWidthCss = `${levelControlWidthPx}px`
  const levelControlResponsiveWidth = { xs: '100%', sm: levelControlWidthCss }

  const ASCENSION_STAR_VALUES: readonly number[] = [0, 1, 2, 3, 4, 5, 6]

  // Helpers for condensed Rank/Rarity selections
  const rankSelected = new Set((state.rank.selected ?? []).map(Number))
  const raritySelected = new Set((state.rarity.selected ?? []).map(Number))
  // Group toggles handled inline in onChange for Rank/Rarity condensed controls

  const toggleLabelSx = [ELLIPSIS_TEXT_SX, { display: 'block', width: '100%', textAlign: 'center', fontSize: 'inherit' as const }]
  const testerConfigFilterOn = testerConfigFilterMode !== TESTER_CONFIG_FILTER_MODE_DEFAULT
  const testerConfigLabelStrings = React.useMemo(() => ({
    first: t('testerFilterConfigsFirst'),
    any: t('testerFilterConfigsAny'),
    off: t('testerFilterConfigsOff'),
  }), [t])
  const testerConfigFilterLabel = testerConfigFilterMode === 'first'
    ? testerConfigLabelStrings.first
    : testerConfigFilterMode === 'any'
      ? testerConfigLabelStrings.any
      : testerConfigLabelStrings.off
  const testerConfigLabelWidthCh = React.useMemo(() => (
    Math.max(
      testerConfigLabelStrings.first.length,
      testerConfigLabelStrings.any.length,
      testerConfigLabelStrings.off.length,
    )
  ), [testerConfigLabelStrings])
  // Keep the button width stable across Rules vs Rule Tester by reserving space for
  // the widest translated value that can appear in either view.
  const configFilterValueWidthCh = React.useMemo(() => (
    Math.max(testerConfigLabelWidthCh, t('configFilterOn').length)
  ), [t, testerConfigLabelWidthCh])
  const testerConfigFilterTooltip = t('filterLimitSelectedConfigsTooltip')
  const configFilterButtonActive = testerConfigFilterOn
  const configFilterButtonDisabled = !hasConfigs || !onTesterConfigFilterModeChange
  const configFilterButtonVariant: 'contained' | 'outlined' = configFilterButtonActive ? 'contained' : 'outlined'
  const configFilterButtonLabel = (
    isTesterMode
      ? (testerConfigFilterOn ? testerConfigFilterLabel : t('testerFilterConfigsOff'))
      : (testerConfigFilterOn ? t('configFilterOn') : t('testerFilterConfigsOff'))
  )
  const previewConfigButtonActive = configChipFilterActive
  const previewConfigButtonVariant: 'contained' | 'outlined' = previewConfigButtonActive ? 'contained' : 'outlined'
  const previewConfigButtonLabel = previewConfigButtonActive ? t('configFilterOn') : t('testerFilterConfigsOff')
  // Match Config Filter's width stabilization pattern so the Preview Configs button
  // doesn't "jump" as Off/On switches (or across localized strings).
  const previewConfigsValueWidthCh = React.useMemo(() => (
    Math.max(t('configFilterOn').length, testerConfigLabelStrings.off.length)
  ), [t, testerConfigLabelStrings.off])
  const testerSourceOptions = React.useMemo(() => {
    const options = [
      { value: 'inventory', label: t('testerSourceInventory') },
      { value: 'collection', label: t('testerSourceEquippedCollection') },
      { value: 'vault', label: t('testerSourceEquippedVault') },
      { value: 'inbox', label: t('testerSourceInbox') },
    ] as const
    return hasManualTesterItems
      ? [...options, { value: 'manual', label: t('testerSourceManual') }]
      : options.slice()
  }, [hasManualTesterItems, t])
  // Keep the first two options anchored on the top row so the base grid stays 2x2.
  const testerSourceRows = React.useMemo(() => {
    const firstRow = testerSourceOptions.slice(0, 2)
    // The second row absorbs the remaining options (manual gear adds the third column here).
    const remaining = testerSourceOptions.slice(2)
    return [firstRow, remaining]
  }, [testerSourceOptions])
  const testerSourcesSelected = state.testerSources?.selected
  const testerSourceSelectionRaw = React.useMemo(
    () => testerSourcesSelected ?? [],
    [testerSourcesSelected],
  )
  const testerSourceSelection = hasManualTesterItems
    ? testerSourceSelectionRaw
    : testerSourceSelectionRaw.filter((value) => value !== 'manual')
  React.useEffect(() => {
    if (!isTesterMode) return
    if (hasManualTesterItems) return
    if (!testerSourceSelectionRaw.includes('manual')) return
    const filtered = testerSourceSelectionRaw.filter((value) => value !== 'manual')
    onChange({
      ...state,
      testerSources: { selected: filtered },
    })
  }, [hasManualTesterItems, isTesterMode, onChange, state, testerSourceSelectionRaw])
  // Shared handler so both toggle rows update the same testerSources payload.
  const handleTesterSourceToggleChange = React.useCallback((_: React.MouseEvent<HTMLElement>, vals: string[]) => {
    const parsed = vals.map((v) => v as TesterSourceFilter)
    onChange({ ...state, testerSources: { selected: parsed } })
  }, [onChange, state])
  const testerChaosMode: TesterChaosFilterMode = state.testerChaos?.mode ?? 'any'
  const testerGlyphMode: TesterGlyphFilterMode = state.testerGlyphs?.mode ?? 'any'
  const testerAscStars = state.testerAscension?.stars ?? []
  const testerAscStats = state.testerAscension?.stats ?? []
  const championSelection = state.testerChampions?.selected ?? []
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
  const showChampionFilter = isTesterMode && (testerChampionOptions?.length ?? 0) > 0
  const [championSearch, setChampionSearch] = React.useState('')
  const normalizedChampionSearch = championSearch.trim()
  const championOptions = React.useMemo(() => testerChampionOptions ?? [], [testerChampionOptions])
  const championOptionMap = React.useMemo(() => {
    const map = new Map<number, TesterChampionOption>()
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
  const championClearAdornmentSx = React.useCallback((theme: Theme) => ({
    minWidth: CLEAR_ICON_BUTTON_SIZE_PX + 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    visibility: championSearch ? 'visible' : 'hidden',
    transition: 'visibility 120ms ease',
    ...(championZeroResults
      ? {
        '& .MuiIconButton-root': {
          backgroundColor: alpha(theme.palette.error.main, 0.18),
          animation: `${ZERO_RESULTS_PULSE} 2000ms ease-in-out infinite`,
        },
      }
      : {}),
  }), [championSearch, championZeroResults])
  const championClearButtonSx = React.useCallback((theme: Theme) => ({
    opacity: championSearch ? 1 : 0,
    pointerEvents: championSearch ? 'auto' : 'none',
    transition: 'opacity 120ms ease',
    ...(championZeroResults
      ? {
        backgroundColor: alpha(theme.palette.error.main, 0.18),
        animation: `${ZERO_RESULTS_PULSE} 2000ms ease-in-out infinite`,
      }
      : {}),
  }), [championSearch, championZeroResults])
  const formatChampionName = React.useCallback((option?: TesterChampionOption | null): string => {
    if (!option) return ''
    if (option.name && option.name.trim().length > 0) return option.name.trim()
    return t('testerChampionUnknownName', { id: option.id })
  }, [t])
  // Dev builds benefit from showing ids inline so missing icon assets are faster to diagnose.
  // Keep prod labels clean by gating behind `import.meta.env.DEV`.
  const formatChampionNameWithDebugId = React.useCallback((option?: TesterChampionOption | null): string => {
    const base = formatChampionName(option)
    if (!import.meta.env.DEV) return base
    if (!option) return base
    // Prefer showing base hero ids (asset key) and equipped champion ids (instance key) together.
    // Some localized fallback strings already include the instance id; keep the suffix anyway so the base id is visible.
    const baseHeroId = typeof option.baseId === 'number' && Number.isFinite(option.baseId) && option.baseId > 0 ? option.baseId : null
    const baseHeroLabel = baseHeroId !== null ? String(baseHeroId) : '?'
    return `${base} (${baseHeroLabel} / ${option.id})`
  }, [formatChampionName])
  const formatChampionLocation = React.useCallback((option?: TesterChampionOption | null): string | null => {
    if (!option?.location) return null
    if (option.location === 'vault' || option.location === 'reserveVault') return t('testerSourceEquippedVault')
    if (option.location === 'collection') return t('testerSourceEquippedCollection')
    return null
  }, [t])
  const handleTesterConfigFilterClick = () => {
    if (!hasConfigs) return
    if (!onTesterConfigFilterModeChange) return
    if (isTesterMode) {
      const next: TesterConfigFilterMode = testerConfigFilterMode === 'off'
        ? 'first'
        : testerConfigFilterMode === 'first'
          ? 'any'
          : 'off'
      onTesterConfigFilterModeChange(next)
      return
    }
    const next: TesterConfigFilterMode = testerConfigFilterMode === 'off' ? 'first' : 'off'
    onTesterConfigFilterModeChange(next)
  }

  // Section labels feed both the header copy and the clear-button tooltips so we only translate once per render.
  const ruleSectionLabel = t(isTesterMode ? 'filterTesterResult' : 'filterRule')
  const setsSectionLabel = t('filterSets')
  const sourcesSectionLabel = t('filterSource')
  const championsSectionLabel = t('testerChampionFilterLabel')
  const lastUseSectionLabel = t('testerLastUsedFilterLabel')
  const mainSectionLabel = t('filterMainstat')
  const subSectionLabel = t('filterSubstats')
  const levelSectionLabel = t('filterLevel')
  const factionSectionLabel = t('filterFaction')
  const slotsSectionLabel = t('filterSlots')
  const rankSectionLabel = t('filterRank')
  const raritySectionLabel = t('filterRarity')
  const ascensionSectionLabel = t('filterAscension')

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
    if (isTesterMode) {
      onChange({ ...state, testerResult: { ...(DEFAULT_RULES_FILTER_STATE.testerResult ?? { keep: 'any', matched: 'any' }) } })
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
      testerSources: { ...(DEFAULT_RULES_FILTER_STATE.testerSources ?? { selected: [] }) },
    })
  }
  const clearChampionsSection = () => {
    onChange({
      ...state,
      testerChampions: { ...(DEFAULT_RULES_FILTER_STATE.testerChampions ?? { selected: [] }) },
    })
  }
  const clearLastUseSection = () => {
    onChange({
      ...state,
      testerLastUse: createDefaultTesterLastUseFilter(),
    })
  }
  const clearMainSection = () => {
    const next: RulesFilterState = {
      ...state,
      main: { ...(DEFAULT_RULES_FILTER_STATE.main ?? { selected: [], anyMode: 'include' }) },
    }
    if (isTesterMode) {
      next.testerChaos = { ...(DEFAULT_RULES_FILTER_STATE.testerChaos ?? { mode: 'any' }) }
    }
    onChange(next)
  }
  const clearSubSection = () => {
    const next: RulesFilterState = {
      ...state,
      sub: { ...(DEFAULT_RULES_FILTER_STATE.sub ?? { selected: [], notSelected: [], mode: 'all', wildcardMode: 'include' }) },
    }
    if (isTesterMode) {
      next.testerGlyphs = { ...(DEFAULT_RULES_FILTER_STATE.testerGlyphs ?? { mode: 'any' }) }
      next.testerRolls = createDefaultTesterRollsState()
    }
    onChange(next)
  }
  const clearLevelSection = () => {
    const defaultLevel = DEFAULT_RULES_FILTER_STATE.level ?? { selected: [], anyMode: 'include', testerRange: undefined }
    const defaultRange = resolveTesterLevelRange(defaultLevel)
    onChange({
      ...state,
      level: {
        ...defaultLevel,
        testerRange: { ...defaultRange },
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
      testerAscension: { ...(DEFAULT_RULES_FILTER_STATE.testerAscension ?? { stars: [], stats: [] }) },
    })
  }

  // Dirty-state probes ensure the clear affordance only lights up when this section diverged from factory defaults.
  const defaultRuleFilter = DEFAULT_RULES_FILTER_STATE.rule ?? { keep: 'any', use: 'any' }
  const defaultTesterResult = DEFAULT_RULES_FILTER_STATE.testerResult ?? { keep: 'any', matched: 'any' }
  const ruleSectionDirty = isTesterMode
    ? ((state.testerResult?.keep ?? defaultTesterResult.keep) !== defaultTesterResult.keep
      || (state.testerResult?.matched ?? defaultTesterResult.matched) !== defaultTesterResult.matched)
    : ((state.rule?.keep ?? defaultRuleFilter.keep) !== defaultRuleFilter.keep
      || (state.rule?.use ?? defaultRuleFilter.use) !== defaultRuleFilter.use)
  const setsSectionDirty = (
    (state.sets.selected.length > 0)
    || ((state.sets.metaSelected?.length ?? 0) > 0)
    || ((state.sets.anyMode ?? DEFAULT_RULES_FILTER_STATE.sets.anyMode) !== DEFAULT_RULES_FILTER_STATE.sets.anyMode)
    || ((state.sets.match ?? DEFAULT_RULES_FILTER_STATE.sets.match) !== DEFAULT_RULES_FILTER_STATE.sets.match)
  )
  const sourcesSectionDirty = isTesterMode && (testerSourceSelectionRaw.length > 0)
  const championsSectionDirty = isTesterMode && (championSelection.length > 0)
  const lastUseSectionDirty = isTesterMode && (
    lastUsePresetSelection.length > 0
    || lastUseCustom.enabled
    || lastUseCustom.minDays > TESTER_LAST_USE_MIN_DAYS
    || lastUseCustom.maxDays < TESTER_LAST_USE_MAX_DAYS
  )
  const mainSectionDirty = (
    (state.main.selected.length > 0)
    || (!isTesterMode && ((state.main.anyMode ?? DEFAULT_RULES_FILTER_STATE.main.anyMode) !== DEFAULT_RULES_FILTER_STATE.main.anyMode))
    || (isTesterMode && (testerChaosMode !== (DEFAULT_RULES_FILTER_STATE.testerChaos?.mode ?? 'any')))
  )
  const subSectionDirty = (
    (state.sub.selected.length > 0)
    || (state.sub.notSelected.length > 0)
    || (state.sub.mode !== DEFAULT_RULES_FILTER_STATE.sub.mode)
    || (isTesterMode && testerGlyphMode !== (DEFAULT_RULES_FILTER_STATE.testerGlyphs?.mode ?? 'any'))
    || (isTesterMode && testerRollsActive)
  )
  const levelSectionDirty = (
    (state.level.selected.length > 0)
    || (!isTesterMode && ((state.level.anyMode ?? DEFAULT_RULES_FILTER_STATE.level.anyMode) !== DEFAULT_RULES_FILTER_STATE.level.anyMode))
    || (isTesterMode && (
      testerLevelRange.min > TESTER_LEVEL_MIN
      || testerLevelRange.max < TESTER_LEVEL_MAX
    ))
  )
  const factionSectionDirty = (
    (state.faction.selected.length > 0)
    || ((state.faction.anyMode ?? DEFAULT_RULES_FILTER_STATE.faction.anyMode) !== DEFAULT_RULES_FILTER_STATE.faction.anyMode)
  )
  const slotsSectionDirty = (
    (selectedSlots.size > 0)
    || (!isTesterMode && ((state.slots.anyMode ?? DEFAULT_RULES_FILTER_STATE.slots.anyMode) !== DEFAULT_RULES_FILTER_STATE.slots.anyMode))
  )
  const rankSectionDirty = (
    (rankSelected.size > 0)
    || (!isTesterMode && ((state.rank.anyMode ?? DEFAULT_RULES_FILTER_STATE.rank.anyMode) !== DEFAULT_RULES_FILTER_STATE.rank.anyMode))
  )
  const raritySectionDirty = (
    (raritySelected.size > 0)
    || (!isTesterMode && ((state.rarity.anyMode ?? DEFAULT_RULES_FILTER_STATE.rarity.anyMode) !== DEFAULT_RULES_FILTER_STATE.rarity.anyMode))
  )
  const ascensionSectionDirty = isTesterMode && (
    (testerAscStars.length > 0)
    || (testerAscStats.length > 0)
  )

  return (
    <Box sx={{ display: 'contents' }}>
      <Box
        sx={(theme) => ({
          border: `1px solid ${theme.palette.divider}`,
          p: 0.75,
          borderRadius: 1,
          mb: 1,
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
            alignItems="center"
            sx={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}
          >
              {Boolean(onTesterConfigFilterModeChange) && (
                <MarkdownTooltip markdown={testerConfigFilterTooltip}>
                  <span>
                    <SplitLabelValueButton
                      size="small"
                      variant={configFilterButtonVariant}
                      color="success"
                      aria-label={t('filterLimitSelectedConfigs')}
                      aria-pressed={configFilterButtonDisabled ? undefined : testerConfigFilterOn}
                      disabled={configFilterButtonDisabled}
                      onClick={handleTesterConfigFilterClick}
                      sx={{
                        height: SMALL_BUTTON_HEIGHT_PX,
                        minHeight: SMALL_BUTTON_HEIGHT_PX,
                        px: 1.25,
                      }}
                      label={t('filterLimitSelectedConfigs')}
                      value={configFilterButtonLabel}
                      valueWidthCh={configFilterValueWidthCh}
                    />
                  </span>
                </MarkdownTooltip>
              )}
              <MarkdownTooltip markdown={t('filterLimitPreviewConfigsTooltip')}>
                <span>
                  <SplitLabelValueButton
                    size="small"
                    variant={previewConfigButtonVariant}
                    color="success"
                    aria-label={t('filterLimitPreviewConfigs')}
                    aria-pressed={hasConfigs ? previewConfigButtonActive : undefined}
                    onClick={() => onConfigChipFilterChange(!configChipFilterActive)}
                    disabled={!hasConfigs}
                    sx={{
                      height: SMALL_BUTTON_HEIGHT_PX,
                      minHeight: SMALL_BUTTON_HEIGHT_PX,
                      px: 1.25,
                    }}
                    label={t('filterLimitPreviewConfigs')}
                    value={previewConfigButtonLabel}
                    valueWidthCh={previewConfigsValueWidthCh}
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
            value={configNameQuery}
            onChange={(e) => handleConfigNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
            size="small"
            inputRef={configNameInputRef}
            placeholder={t('builderConfigName')}
            error={configNameRegexError}
            inputProps={{
              'aria-label': t('builderConfigName'),
              'aria-invalid': configNameRegexError ? 'true' : undefined,
              title: configNameRegexError ? t('filterConfigNameInvalid') : undefined,
            }}
            InputProps={{
              endAdornment: configNameQuery ? (
                <InputAdornment position="end">
                  <ClearIconButton
                    size="small"
                    edge="end"
                    aria-label={t('builderClearConfigName')}
                    tooltip={t('builderClearConfigName')}
                    onClick={() => handleConfigNameChange('')}
                  />
                </InputAdornment>
              ) : null,
            }}
            sx={{ flex: 1 }}
          />
        </Box>
      </Box>
      <Divider sx={{ mb: 1, opacity: 0.5 }} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          columnGap: 1,
          rowGap: 0.75,
        }}
      >
        {/* Left column */}
        <Box>
          {/* Top row: Rule/Result (left) and Sets (right) inside a nested grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto minmax(0, 1fr)' }, columnGap: 1, rowGap: 0.75 }}>
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <SectionHeader
              id="rule"
              label={ruleSectionLabel}
              actions={renderSectionClearButton(
                ruleSectionDirty,
                formatSectionClearLabel(ruleSectionLabel),
                clearRuleSection,
              )}
            />
            <Collapse in={!collapsed.rule} timeout="auto" unmountOnExit>
            {isTesterMode ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <ToggleButtonGroup
                    size="small"
                    value={state.testerResult?.keep ?? 'any'}
                    exclusive
                    onChange={(_, v: Bool3 | null) => {
                      const next = v ?? 'any'
                      onChange({
                        ...state,
                        testerResult: { keep: next, matched: state.testerResult?.matched ?? DEFAULT_RULES_FILTER_STATE.testerResult!.matched },
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
                    value={state.testerResult?.matched ?? 'any'}
                    exclusive
                    onChange={(_, v: Bool3 | null) => {
                      const next = v ?? 'any'
                      onChange({
                        ...state,
                        testerResult: { keep: state.testerResult?.keep ?? DEFAULT_RULES_FILTER_STATE.testerResult!.keep, matched: next },
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
                    <ToggleButton value={'yes'}>
                      <EllipsisTooltip title={t('testerResultMatched')} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t('testerResultMatched')}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                    <ToggleButton value={'no'}>
                      <EllipsisTooltip title={t('testerMatchNoRule')} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t('testerMatchNoRule')}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                  </ToggleButtonGroup>
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
          {/* Sets (compact, capped width on sm+) */}
          <FormControl
            fullWidth
            sx={{
              mb: 0.75,
              width: { xs: '100%', sm: `min(100%, ${FILTER_SETS_SELECT_WIDTH_PX}px)` },
              maxWidth: FILTER_SETS_SELECT_WIDTH_PX,
            }}
          >
            <SectionHeader
              id="sets"
              label={setsSectionLabel}
              actions={renderSectionClearButton(
                setsSectionDirty,
                formatSectionClearLabel(setsSectionLabel),
                clearSetsSection,
              )}
            />
            <Collapse in={!collapsed.sets} timeout="auto" unmountOnExit>
            {(() => {
              const sorted = filterAndSortSetEntries(setsSearch, setsOrder, { translate: t })
              const metasetsMenu = visibleMetasets
              const hasAnySelection = selectedSetTokens.length > 0
              const inlinePaddingPx = hasAnySelection ? SETS_SELECT_INLINE_GUTTER_PX : SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX
              const handleClearSetSelection = () => {
                setHoveredSetMetaId(null)
                onChange({ ...state, sets: { ...state.sets, selected: [], metaSelected: [] } })
              }
              return (
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
                        const theoreticalMax = (metasetsMenu.length > 0)
                          ? (MENU_MAX_HEIGHT_METASETS_PX + MENU_MAX_HEIGHT_SETS_LIST_PX)
                          : (MENU_MAX_HEIGHT_SETS_LIST_PX)
                        const desiredTop = rect ? Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - theoreticalMax - margin)) : margin
                        const desiredLeft = rect ? Math.floor(rect.left) : margin
                        setSetsMenuAnchorPos({ top: desiredTop, left: desiredLeft })
                        const selectedMetasetIds = new Set(state.sets.metaSelected ?? [])
                        const targetMetasetId = (() => {
                          if (metasetsMenu.length === 0) return null
                          const firstSelected = metasetsMenu.find((meta) => selectedMetasetIds.has(meta.id))
                          return firstSelected?.id ?? null
                        })()
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
                              const list = metasetsMenuListRef.current
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
                      PaperProps: {
                        sx: {
                          width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX },
                          maxWidth: SETS_MENU_WIDTH_PX,
                          overflowX: 'hidden',
                        },
                        ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el }
                      },
                      MenuListProps: { sx: { width: '100%', maxWidth: '100%' } },
                      ...(setsMenuAnchorPos
                        ? { anchorReference: 'anchorPosition' as const, anchorPosition: setsMenuAnchorPos, transformOrigin: { vertical: 'top', horizontal: 'left' as const } }
                        : { transformOrigin: { vertical: 'top', horizontal: 'left' as const } }),
                    }}
                    sx={{
                      width: '100%',
                      minWidth: 0,
                      cursor: 'pointer',
                      pr: `${inlinePaddingPx}px`,
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
                  {(metasetsMenu.length > 0) && (
                    <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                      <Box
                        component="ul"
                        ref={metasetsMenuListRef}
                        sx={{
                          listStyle: 'none', p: 0, m: 0,
                          maxHeight: MENU_MAX_HEIGHT_METASETS_PX,
                          overflowY: 'auto',
                          pr: `${MENU_SCROLL_GUTTER_PX}px`,
                          ...reserveScrollbarGutterSpace({ basePaddingInlineEnd: `${MENU_SCROLL_GUTTER_PX}px` }),
                        }}
                        data-tour-id="menu.metasets.section"
                      >
                      <ListSubheader sx={LIST_SUBHEADER_SX}>{t('menuMetasetsSection')}</ListSubheader>
                      {metasetsMenu.map((m) => {
                        const { glyph, iconId } = metasetGlyph(m)
                        const hasGlyph = glyph != null && !!iconId
                        const needsGap = iconId !== null && iconId !== 'empty'
                        const tooltipName = hasGlyph ? `${glyph}${needsGap ? ` ${m.name}` : m.name}` : m.name
                        const displayGap = hasGlyph && needsGap ? 0.75 : 0.5
                        const selected = (state.sets.metaSelected ?? []).includes(m.id)
                        const setNames = m.sets.map(id => getLocalizedGearSetName(id, t, lang)).filter(Boolean)
                        const joined = setNames.join(', ')
                        return (
                          <MenuItem
                              key={m.id}
                              value={`m:${m.id}`}
                              selected={selected}
                              data-metaset-id={m.id}
                              onMouseEnter={() => setHoveredSetMetaId(m.id)}
                              onMouseLeave={() => setHoveredSetMetaId(prev => prev === m.id ? null : prev)}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const token = `m:${m.id}`
                                const tokensSet = new Set<string>(selectedSetTokens)
                                if (tokensSet.has(token)) tokensSet.delete(token); else tokensSet.add(token)
                                const tokens = Array.from(tokensSet)
                                const metaIds = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
                                const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
                                onChange({ ...state, sets: { ...state.sets, metaSelected: metaIds, selected: setIds } })
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
                                <EllipsisTooltip title={joined} wrap="block">
                                  <Typography
                                    variant="caption"
                                    data-ellipsis-target
                                    sx={{ color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }}
                                  >
                                    {joined}
                                  </Typography>
                                </EllipsisTooltip>
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
                            zeroResults={filterAndSortSetEntries(setsSearch, setsOrder, { translate: t }).length === 0}
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
                      }}
                    >
                      <SetMenuSection
                        title="Sets"
                        sorted={sorted}
                        setsOrder={setsOrder}
                        metasets={metasets}
                        setUsageCounts={{}}
                        showUsageCounts={false}
                        valueForSet={(id) => `s:${id}`}
                        onToggleSet={(id) => {
                          const idNum = Number(id)
                          const prev = new Set(state.sets.selected.map(Number))
                          if (prev.has(idNum)) prev.delete(idNum); else prev.add(idNum)
                          const next = Array.from(prev).sort((a,b)=>a-b)
                          onChange({ ...state, sets: { ...state.sets, selected: next } })
                        }}
                        hideHeader
                        hoveredMetasetId={hoveredSetMetaId}
                        selectedMetasetIds={state.sets.metaSelected ?? []}
                        selectedSetIds={state.sets.selected.map(Number)}
                      />
                    </Box>
                  </Box>
                  </Select>
                <InlineSelectClearButton
                  disabled={!hasAnySelection}
                  label={t('clear')}
                  onClear={handleClearSetSelection}
                />
                <SelectDropdownActivator
                  getDisplayNode={() => {
                    const root = setsSelectContainerRef.current
                    if (!root) return null
                    return root.querySelector('[role="combobox"]') as HTMLElement | null
                  }}
                  widthPx={hasAnySelection ? undefined : SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX}
                />
              </Box>
            )
          })()}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: FILTER_CHIP_TOP_MARGIN, flexWrap: 'wrap' }}>
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
                  sx={tintedChipSx((state.sets.match ?? 'any') === 'any' ? theme.palette.success : theme.palette.info)}
                />
              </MarkdownTooltip>
            </Stack>
            </Collapse>
          </FormControl>
          </Box>
          {isTesterMode && (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                columnGap: 1,
                rowGap: 0.75,
                mb: 0.75,
                alignItems: 'flex-start',
              }}
            >
              <FormControl sx={{ ...collapsibleSectionSx }}>
                <SectionHeader
                  id="sources"
                  label={sourcesSectionLabel}
                  fullWidth={false}
                  actions={renderSectionClearButton(
                    sourcesSectionDirty,
                    formatSectionClearLabel(sourcesSectionLabel),
                    clearSourcesSection,
                  )}
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
                    {testerSourceRows.map((rowOptions, rowIdx) => {
                      if (rowOptions.length === 0) return null
                      return (
                        <ToggleButtonGroup
                          key={`tester-sources-row-${rowIdx}`}
                          size="small"
                          value={testerSourceSelection}
                          onChange={handleTesterSourceToggleChange}
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
                  <SectionHeader
                    id="champions"
                    label={championsSectionLabel}
                    actions={renderSectionClearButton(
                      championsSectionDirty,
                      formatSectionClearLabel(championsSectionLabel),
                      clearChampionsSection,
                    )}
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
                          onChange({ ...state, testerChampions: { selected: parsed } })
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
                          MenuListProps: {
                            autoFocus: false,
                            autoFocusItem: false,
                          },
                          PaperProps: {
                            sx: {
                              width: { xs: 'calc(100vw - 32px)', sm: CHAMPION_MENU_WIDTH_PX },
                              maxWidth: CHAMPION_MENU_WIDTH_PX,
                              maxHeight: 360,
                              '& .MuiList-root': {
                                py: 0,
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
                          placeholder={t('testerChampionSearchPlaceholder')}
                          fullWidth
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          InputProps={{
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
                          }}
                        />
                      </ListSubheader>
	                      {filteredChampionOptions.map((option) => {
	                        const locationLabel = formatChampionLocation(option)
	                        const championLabel = formatChampionNameWithDebugId(option)
	                        // Prefer base hero ids for icons so duplicate champion copies share the same avatar.
	                        const championIconSrc = championIconUrl(option.baseId ?? option.id)
	                        // Mirror the tester grid rarity border so the dropdown signals overall quality at a glance.
	                        const championBorderColor = resolveRarityAccentColor(option.rarity) ?? theme.palette.divider
                        const championFallbackInitial = (() => {
                          const trimmed = championLabel.trim()
                          return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '?'
                        })()
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
                                  bgcolor: championIconSrc ? 'transparent' : alpha(theme.palette.text.primary, 0.08),
                                  color: theme.palette.text.secondary,
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
                        onClear={() => onChange({ ...state, testerChampions: { selected: [] } })}
                      />
                    </Box>
                  </Collapse>
                </FormControl>
              )}
              <FormControl sx={{ ...collapsibleSectionSx }}>
                <SectionHeader
                  id="lastUse"
                  label={lastUseSectionLabel}
                  fullWidth={false}
                  maxWidth={`${LAST_USE_SECTION_WIDTH_PX}px`}
                  actions={renderSectionClearButton(
                    lastUseSectionDirty,
                    formatSectionClearLabel(lastUseSectionLabel),
                    clearLastUseSection,
                  )}
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
                          width: LAST_USE_TOGGLE_BUTTON_WIDTH_PX,
                          minWidth: LAST_USE_TOGGLE_BUTTON_WIDTH_PX,
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
                            handleLastUsePresetToggle(option.value as TesterLastUsePreset)
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
              flexWrap: 'wrap',
              columnGap: 1,
              rowGap: 0.75,
              mb: 0.75,
              alignItems: 'flex-start',
            }}
          >
            {/* Mainstat (below Sets) */}
            <FormControl sx={collapsibleSectionSx}>
              <SectionHeader
                id="main"
                label={mainSectionLabel}
                actions={renderSectionClearButton(
                  mainSectionDirty,
                  formatSectionClearLabel(mainSectionLabel),
                  clearMainSection,
                )}
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
                      {t(statVariantI18nKey(variant))}
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
                      {t(statVariantI18nKey(variant))}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
              {isTesterMode ? (
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
                        testerChaosMode === 'notRerolled'
                          ? GLYPH_NOT_REROLLED
                          : testerChaosMode === 'rerolled'
                            ? GLYPH_REROLLED
                            : GLYPH_GTE_ZERO
                      }`}
                      aria-label={`${t('filterChaosOre')}: ${
                        testerChaosMode === 'notRerolled'
                          ? t('filterChaosOreNotRerolled')
                          : testerChaosMode === 'rerolled'
                            ? t('filterChaosOreRerolled')
                            : t('filterChaosOreAny')
                      }`}
                      onClick={() => {
                        const next: TesterChaosFilterMode =
                          testerChaosMode === 'any'
                            ? 'notRerolled'
                            : testerChaosMode === 'notRerolled'
                              ? 'rerolled'
                              : 'any'
                        onChange({ ...state, testerChaos: { mode: next } })
                      }}
                      sx={tintedChipSx(testerChaosMode === 'any' ? theme.palette.success : testerChaosMode === 'notRerolled' ? theme.palette.info : theme.palette.warning)}
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
              <SectionHeader
                id="sub"
                label={subSectionLabel}
                actions={renderSectionClearButton(
                  subSectionDirty,
                  formatSectionClearLabel(subSectionLabel),
                  clearSubSection,
                )}
              />
              <Collapse in={!collapsed.sub} timeout="auto" unmountOnExit>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {(() => {
                  // Substat filter buttons are tri-state per stat:
                  // - Off: no constraint.
                  // - Left click: must have this substat.
                  // - Right click: must not have this substat.
                  const mustHave = state.sub.selected
                  const mustNot = state.sub.notSelected

                  // ToggleButtonGroup expects a single "selected values" list, so represent
                  // include/exclude as one active union for presentation.
                  const unionRaw: StatVariant[] = []
                  const seen = new Set<number>()
                  for (const variant of [...mustHave, ...mustNot]) {
                    const key = Number(variant)
                    if (seen.has(key)) continue
                    seen.add(key)
                    unionRaw.push(key as StatVariant)
                  }
                  const activeUnion = sortVariantsInUiOrder(unionRaw)

                  const mustHaveSet = new Set(mustHave.map(Number))
                  const mustNotSet = new Set(mustNot.map(Number))

                  const setTriStateVariant = (variant: StatVariant, mode: 'include' | 'exclude' | 'off') => {
                    // Always clear both lists first to avoid overlap (back-compat safety).
                    const nextMustHaveBase = toggleVariantOff(mustHave, variant)
                    const nextMustNotBase = toggleVariantOff(mustNot, variant)
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

                  const renderSubstatButton = (variant: StatVariant) => {
                    const label = t(statVariantI18nKey(variant))
                    const isMustNot = mustNotSet.has(Number(variant))
                    const isActive = mustHaveSet.has(Number(variant)) || isMustNot
                    return (
                      <ToggleButton
                        key={variant}
                        value={String(variant)}
                        aria-label={labelOfVariant(variant)}
                        onClick={() => {
                          // Left click: Off -> include, Active -> Off.
                          setTriStateVariant(variant, isActive ? 'off' : 'include')
                        }}
                        onContextMenu={(e) => {
                          // Right click: Off -> exclude, Active -> Off.
                          e.preventDefault()
                          setTriStateVariant(variant, isActive ? 'off' : 'exclude')
                        }}
                      >
                        <Box
                          component="span"
                          {...(isMustNot ? { sx: SUBSTAT_NOT_LABEL_SX } : {})}
                        >
                          {label}
                        </Box>
                      </ToggleButton>
                    )
                  }

                  return (
                    <>
                      <ToggleButtonGroup
                        size="small"
                        value={filterRowSelection(activeUnion, STAT_VARIANTS_PRIORITY_ROW1)}
                        sx={buildToggleGridSx(STAT_VARIANTS_PRIORITY_ROW1.length)}
                      >
                        {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => renderSubstatButton(variant))}
                      </ToggleButtonGroup>
                      <ToggleButtonGroup
                        size="small"
                        value={filterRowSelection(activeUnion, STAT_VARIANTS_PRIORITY_ROW2)}
                        sx={buildToggleGridSx(STAT_VARIANTS_PRIORITY_ROW2.length)}
                      >
                        {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => renderSubstatButton(variant))}
                      </ToggleButtonGroup>
                    </>
                  )
                })()}
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
                    sx={tintedChipSx(state.sub.mode === 'any' ? theme.palette.success : theme.palette.info)}
                  />
                </MarkdownTooltip>
                {isTesterMode && (
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
                        testerGlyphMode === 'on'
                          ? GLYPH_GLYPHS_ON
                          : testerGlyphMode === 'selected'
                            ? GLYPH_GLYPHS_SELECTED
                            : testerGlyphMode === 'off'
                              ? GLYPH_GLYPHS_OFF
                              : GLYPH_GTE_ZERO
                      }`}
                      aria-label={`${t('filterGlyphs')}: ${
                        testerGlyphMode === 'on'
                          ? t('filterGlyphsOn')
                          : testerGlyphMode === 'selected'
                            ? t('filterGlyphsSelected')
                            : testerGlyphMode === 'off'
                              ? t('filterGlyphsOff')
                              : t('filterGlyphsAny')
                      }`}
                      onClick={() => {
                        const next: TesterGlyphFilterMode =
                          testerGlyphMode === 'any'
                            ? 'on'
                            : testerGlyphMode === 'on'
                              ? 'selected'
                              : testerGlyphMode === 'selected'
                                ? 'off'
                                : 'any'
                        onChange({ ...state, testerGlyphs: { mode: next } })
                      }}
                      sx={tintedChipSx(
                        testerGlyphMode === 'any'
                          ? theme.palette.success
                          : testerGlyphMode === 'on'
                            ? theme.palette.info
                            : testerGlyphMode === 'selected'
                              ? theme.palette.secondary
                              : theme.palette.warning,
                      )}
                    />
                  </MarkdownTooltip>
                )}
                {isTesterMode && (
                  <MarkdownTooltip markdown={rollSummaryDescription}>
                    <Chip
                      size="small"
                      label={rollChipLabel}
                      aria-label={rollChipAria}
                      onClick={(event) => setTesterRollsAnchorEl(event.currentTarget)}
                      variant="filled"
                      sx={tintedChipSx(testerRollsActive ? theme.palette.info : theme.palette.success)}
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
              <SectionHeader
                id="level"
                label={levelSectionLabel}
                actions={renderSectionClearButton(
                  levelSectionDirty,
                  formatSectionClearLabel(levelSectionLabel),
                  clearLevelSection,
                )}
              />
              <Collapse in={!collapsed.level} timeout="auto" unmountOnExit>
                {isTesterMode ? (
                  <Box sx={{
                    mt: 0.25,
                    width: levelControlResponsiveWidth,
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    px: 1.25,
                    pr: showFaction ? 2 : 0,
                  }}>
                    <Slider
                      size="small"
                      min={TESTER_LEVEL_MIN}
                      max={TESTER_LEVEL_MAX}
                      step={1}
                      disableSwap
                      value={[testerLevelRange.min, testerLevelRange.max]}
                      marks={testerLevelSliderMarks}
                      valueLabelDisplay="auto"
                      getAriaLabel={() => t('filterLevel')}
                      getAriaValueText={(value) => `+${value}`}
                      valueLabelFormat={(value) => `+${value}`}
                      onChange={(_, value) => {
                        if (!Array.isArray(value) || value.length !== 2) return
                        const [rawMin, rawMax] = value as [number, number]
                        const normalized = resolveTesterLevelRange({
                          ...state.level,
                          testerRange: { min: rawMin, max: rawMax },
                        })
                        if (normalized.min === testerLevelRange.min && normalized.max === testerLevelRange.max) return
                        onChange({ ...state, level: { ...state.level, testerRange: normalized } })
                      }}
                      sx={{
                        width: '100%',
                        '& .MuiSlider-track': { height: 4 },
                        '& .MuiSlider-rail': { height: 4 },
                        '& .MuiSlider-thumb': { width: 16, height: 16 },
                        '& .MuiSlider-mark': { height: 8 },
                        '& .MuiSlider-markLabel': { fontSize: '0.75rem', mt: 0.5 },
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
                <SectionHeader
                  id="faction"
                  label={factionSectionLabel}
                  actions={renderSectionClearButton(
                    factionSectionDirty,
                    formatSectionClearLabel(factionSectionLabel),
                    clearFactionSection,
                  )}
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
                      MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
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
                    {[Faction.Dwarves, Faction.Shadowkin, Faction.SylvanWatchers].map((code) => (
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
            flexWrap: 'wrap',
            columnGap: 1,
            rowGap: 0.75,
            mb: 0.75,
            alignItems: 'flex-start',
          }}
        >
          {/* Slots */}
          <FormControl sx={collapsibleSectionSx}>
            <SectionHeader
              id="slots"
              label={slotsSectionLabel}
              actions={renderSectionClearButton(
                slotsSectionDirty,
                formatSectionClearLabel(slotsSectionLabel),
                clearSlotsSection,
              )}
            />
            <Collapse in={!collapsed.slots} timeout="auto" unmountOnExit>
              <ToggleButtonGroup
                size="small"
                value={Array.from(selectedSlots).map(String)}
                onChange={(_, vals: string[]) => {
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
                {slotButtons.map((s) => {
                  const Icon = artifactTypeIconFor(s.id)
                  if (!Icon) {
                    // Icons are baked in for all known slots; returning null avoids rendering
                    // an incorrectly styled text fallback if a new id slips through.
                    return null
                  }
                  return (
                    <MarkdownTooltip key={s.id} markdown={s.name} placement="bottom">
                      <ToggleButton value={String(s.id)} aria-label={s.name}>
                        <Icon fontSize="inherit" />
                      </ToggleButton>
                    </MarkdownTooltip>
                  )
                })}
              </ToggleButtonGroup>
              {!isTesterMode && (
                <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>
                  {anyChip(t('filterSlots'), state.slots.anyMode, (v) => onChange({ ...state, slots: { ...state.slots, anyMode: v } }), t('filterAnyTooltip', { field: t('filterSlots') }))}
                </Box>
              )}
              </Collapse>
            </FormControl>

          {/* Rank */}
          <FormControl sx={collapsibleSectionSx}>
            <SectionHeader
              id="rank"
              label={rankSectionLabel}
              actions={renderSectionClearButton(
                rankSectionDirty,
                formatSectionClearLabel(rankSectionLabel),
                clearRankSection,
              )}
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
                    '& .MuiToggleButton-root': { p: 0.5, minWidth: 44, height: 28 },
                  }, GRID_TOGGLE_BUTTON_GROUP_SX]}
                >
                  {[1, 2, 3, 4, 5, 6].map((rank) => (
                    <ToggleButton key={rank} value={String(rank)}>
                      {t(`star${rank}`)}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                {!isTesterMode && (
                  <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>
                    {anyChip(t('filterRank'), state.rank.anyMode, (v) => onChange({ ...state, rank: { ...state.rank, anyMode: v } }), t('filterAnyTooltip', { field: t('filterRank') }))}
                  </Box>
                )}
              </Collapse>
            </FormControl>

          {/* Rarity */}
          <FormControl sx={collapsibleSectionSx}>
            <SectionHeader
              id="rarity"
              label={raritySectionLabel}
              actions={renderSectionClearButton(
                raritySectionDirty,
                formatSectionClearLabel(raritySectionLabel),
                clearRaritySection,
              )}
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
                {!isTesterMode && (
                  <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>
                    {anyChip(t('filterRarity'), state.rarity.anyMode, (v) => onChange({ ...state, rarity: { ...state.rarity, anyMode: v } }), t('filterAnyTooltip', { field: t('filterRarity') }))}
                  </Box>
                )}
              </Collapse>
            </FormControl>
        </Box>
        {isTesterMode && (
          <FormControl sx={{ ...collapsibleSectionSx, mb: 0.75 }}>
            <SectionHeader
              id="ascension"
              label={ascensionSectionLabel}
              actions={renderSectionClearButton(
                ascensionSectionDirty,
                formatSectionClearLabel(ascensionSectionLabel),
                clearAscensionSection,
              )}
            />
            <Collapse in={!collapsed.ascension} timeout="auto" unmountOnExit>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ flex: { xs: '1 1 100%', md: '0 0 auto' }, minWidth: 0 }}>
                  <ToggleButtonGroup
                    size="small"
                    value={testerAscStars.map(String)}
                    onChange={(_, vals: string[]) => {
                      const parsed = vals
                        .map((v) => Number(v))
                        .filter((n) => Number.isFinite(n)) as number[]
                      const prev = state.testerAscension ?? DEFAULT_RULES_FILTER_STATE.testerAscension!
                      onChange({ ...state, testerAscension: { ...prev, stars: parsed } })
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
                    value={filterRowSelection(testerAscStats, STAT_VARIANTS_PRIORITY_ROW1)}
                    onChange={(_, vals: string[]) => {
                      const prev = state.testerAscension ?? DEFAULT_RULES_FILTER_STATE.testerAscension!
                      const nextStats = mergeRowSelection(prev.stats ?? [], STAT_VARIANTS_PRIORITY_ROW1, vals)
                      onChange({ ...state, testerAscension: { ...prev, stats: nextStats } })
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
                    value={filterRowSelection(testerAscStats, STAT_VARIANTS_PRIORITY_ROW2)}
                    onChange={(_, vals: string[]) => {
                      const prev = state.testerAscension ?? DEFAULT_RULES_FILTER_STATE.testerAscension!
                      const nextStats = mergeRowSelection(prev.stats ?? [], STAT_VARIANTS_PRIORITY_ROW2, vals)
                      onChange({ ...state, testerAscension: { ...prev, stats: nextStats } })
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
        )}
      </Box>
      {/* Faction moved to left column */}
    </Box>

        {/* Full-width rows */}
        {/* No full-width Main/Sub section: they live under Sets in the left column */}
      </Box>
      {isTesterMode && (
        <>
          <Popover
            open={testerRollsOpen}
            anchorEl={testerRollsAnchorEl}
            onClose={handleTesterRollsClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
              paper: buildContextMenuPaperSlotProps({
                component: ContextMenuPaper,
                contextMenuGuard: testerRollsGuard,
                onRequestClose: handleTesterRollsClose,
                closeLabel: t('close'),
                ref: testerRollsPaperRef,
                sx: { width: 310, maxWidth: 'calc(100vw - 32px)', p: 2.25 },
              }),
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
                      ? (substatColors?.[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant] ?? theme.palette.text.primary)
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
              paper: buildContextMenuPaperSlotProps({
                component: ContextMenuPaper,
                contextMenuGuard: lastUsePopoverGuard,
                onRequestClose: handleLastUsePopoverClose,
                closeLabel: t('close'),
                ref: lastUsePopoverPaperRef,
                sx: { width: 320, maxWidth: 'calc(100vw - 32px)', p: 2.25 },
              }),
            }}
          >
            <Stack spacing={1.5}>
              <ContextMenuTitle title={t('testerLastUsedRangeTitle')} description={t('testerLastUsedRangeDescription')} />
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                <TextField
                  type="number"
                  size="small"
                  label={t('testerLastUsedRangeMinLabel')}
                  inputProps={{ min: TESTER_LAST_USE_MIN_DAYS, max: TESTER_LAST_USE_MAX_DAYS }}
                  value={lastUseCustom.minDays}
                  onChange={handleLastUseInputChange('minDays')}
                  sx={{ flex: '1 1 120px' }}
                />
                <TextField
                  type="number"
                  size="small"
                  label={t('testerLastUsedRangeMaxLabel')}
                  inputProps={{ min: TESTER_LAST_USE_MIN_DAYS, max: TESTER_LAST_USE_MAX_DAYS }}
                  value={lastUseCustom.maxDays}
                  onChange={handleLastUseInputChange('maxDays')}
                  sx={{ flex: '1 1 120px' }}
                />
              </Box>
              <Slider
                value={[lastUseCustom.minDays, lastUseCustom.maxDays]}
                min={TESTER_LAST_USE_MIN_DAYS}
                max={TESTER_LAST_USE_MAX_DAYS}
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
                  {t('testerLastUsedRangeReset')}
                </Button>
              </Box>
            </Stack>
          </Popover>
        </>
      )}
    </Box>
  )
})

export default RulesFilterPanel

type RollCountToggleButtonsProps = {
  counts: TesterRollCountSet
  ariaLabelPrefix: string
  onToggle: (value: TesterRollCountValue) => void
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
      {TESTER_ROLL_COUNT_VALUES.map((value) => (
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
