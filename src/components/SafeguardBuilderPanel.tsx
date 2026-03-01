/**
 * SafeguardBuilderPanel
 *
 * Inline editor for a single SafeguardRule. Controls mirror BuilderPanel styling and layout:
 * - Row 1: Mode toggle + Required count
 * - Row 2: [Rank | Rarity | Faction Select (nested 3-col)] | [Ignore chips]
 * - Row 3: [Main stat toggles + perMainStat chip] | [Substats toggles + match chips + weights]
 * - Row 4: [Slots icon grid + perSlot chip] | [Sets selector + perSet chip]
 *
 * When no rule is selected the form renders disabled so the panel height remains stable.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  Collapse,
  Divider,
  FormControl,
  FormLabel,
  IconButton,
  InputAdornment,
  InputBase,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import RedoIcon from '@mui/icons-material/Redo'
import TuneIcon from '@mui/icons-material/Tune'
import UndoIcon from '@mui/icons-material/Undo'
import {
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  constrainSafeguardSubstats,
  normalizeSafeguardSubstatMatch,
  normalizeSafeguardRule,
  pruneSafeguardsSubstatWeights,
  safeguardWeightsEnabled,
  sanitizeSafeguardCountMode,
  sortSafeguardCombination,
  sortSafeguardSubstats,
  createFactorySafeguardBuilderDefaults,
  type SafeguardRule,
} from '../lib/safeguards'
import type { ColorBlindMode } from '../lib/constants'
import { SAFEGUARD_BUILDER_USER_DEFAULTS_KEY } from '../lib/constants'
import {
  STAT_VARIANTS_PRIORITY_ROW1,
  STAT_VARIANTS_PRIORITY_ROW2,
  statVariantI18nKey,
  type StatVariant,
} from '../lib/types'
import {
  BUILDER_LABEL_INLINE_SX,
  BUILDER_LABEL_TEXT_SX,
  BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
  CLEAR_ICON_BUTTON_SIZE_PX,
  DANGER_TINT_BG,
  FONT_SIZE_BASE_PX,
  GLYPH_PER_FACTION,
  GLYPH_PER_MAIN_STAT,
  GLYPH_PER_SET,
  GLYPH_PER_SLOT,
  GLYPH_PER_SUBSTAT,
  HISTORY_TOOLTIP_MAX_WIDTH_PX,
  NBSP,
  SMALL_BUTTON_HEIGHT_PX,
  UI_BG_HOVER_DANGER_TRANSITION,
} from '../lib/constants'

import type { BuilderRecipe } from '../lib/hsfBuilder/types'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useBuilderPanelActionMenus } from './builderPanel/useBuilderPanelActionMenus'
import { useBuilderHistoryMenu } from './builderPanel/useBuilderHistoryMenu'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { HistoryContextMenu } from './HistoryContextMenu'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import type { HistoryPreview, HistoryTimelineEntry } from '../hooks/useSfrHistory'
import { useAutoResetAfterInsertPreference, useAutoApplySelectedRecipePreference, useBuilderSafeguardCollapsedPreference, BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS } from '../state/builderPreferences'
import { summaryParts } from './RecipeChip'
import { useDisplayPreferences } from '../state/preferencesState'
import { useSlotMetrics } from '../hooks/useSlotMetrics'
import { parseRecipeNameDirectives } from '../lib/recipeNameDirectives'
import { slotSelectionAllowsAccessories } from '../lib/gearInspectorDomain'
import { useI18n } from '../lib/i18n'
import { GearFactionSelect, GearRankSelect, GearRaritySelect, GearSetsSelect } from './gear'
import { NumberSpinnerAdornment } from './NumberSpinnerAdornment'
import MarkdownTooltip from './MarkdownTooltip'
import EllipsisTooltip from './EllipsisTooltip'
import { GearInspectorSortWeightControls } from './GearInspectorSortWeightControls'
import { useKeepOverrideCombinationTools } from './keepOverrides/useKeepOverrideCombinationTools'
import {
  dedupeNumericArray,
  dedupeStringArray,
  getMainStatOptionsForSlots,
} from './keepOverrides/keepOverrideRuleUtils'
import {
  resolveKeepOverrideScopeActive,
  toggleKeepOverrideCountMode,
  type KeepOverrideScopeKey,
} from '../lib/keepOverrideScope'
import { KeepOverrideScopeChip } from './keepOverrides/KeepOverrideScopeChip'
import { normalizeArtifactSetSelections } from '../lib/gearSets/selection'
import { resolveAllowedSubstatsForSlotsAndMains } from '../lib/statCompatibility'
import { normalizeGearInspectorSortWeight, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT, GEAR_INSPECTOR_SORT_WEIGHT_STEP } from '../lib/gearInspectorSort'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import { artifactTypeIconList } from './artifactTypeIcons'
import ClearIconButton from './ClearIconButton'
import { mainStatToggleGroupSx, substatToggleGroupSx } from './SubstatToggleDisplay'
import { useTheme } from '@mui/material/styles'
import type { Metaset } from '../lib/metasets'

// ── constants ────────────────────────────────────────────────────────────────

const SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX = {
  '& .MuiChip-label': {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
} as const

const CLEAR_PLACEHOLDER_SX = {
  width: CLEAR_ICON_BUTTON_SIZE_PX,
  height: CLEAR_ICON_BUTTON_SIZE_PX,
  flexShrink: 0,
} as const

// Mirrors BuilderPanel's selectBoxHeightSx / selectContentHeightSx.
// width: '100% ensures the Select fills its FormControl column rather than
// growing to fit the rendered value text when items are selected.
const SELECT_BOX_HEIGHT_SX = {
  width: '100%',
  height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
  minHeight: BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
  '& .MuiSelect-select': {
    display: 'flex',
    alignItems: 'center',
    minHeight: 'unset',
    paddingTop: 0,
    paddingBottom: 0,
  },
} as const



// ── helpers ──────────────────────────────────────────────────────────────────

// Strips heading markers and color/style directives from separator names for display.
function parseSeparatorLabel(rawName: string | undefined): string {
  return parseRecipeNameDirectives(rawName, '').displayName.replace(/^#+\s*/, '').trim()
}

// ── component ────────────────────────────────────────────────────────────────

export type SafeguardBuilderPanelProps = {
  rule: SafeguardRule
  onChange: (next: SafeguardRule | ((prev: SafeguardRule) => SafeguardRule)) => void
  editingRuleId: string | null
  editingRuleIndex: number | null
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  colorBlindMode: ColorBlindMode
  recipes: readonly BuilderRecipe[]
  onInsertSafeguard: () => void
  onApplySafeguard: () => void
  onResetSafeguard: () => void
  onScaffoldFromRecipe: (recipeIndex: number) => void
  registerAutoApplyHandler?: ((fn: (() => boolean) | null) => void) | undefined
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  undoPreview: HistoryPreview
  redoPreview: HistoryPreview
  historyTimeline: HistoryTimelineEntry[]
  onJumpToHistoryIndex: (index: number) => void
  onRequestClearHistory: () => void
  onManageMetasets: () => void
}

export default function SafeguardBuilderPanel({
  rule,
  onChange,
  editingRuleId,
  editingRuleIndex,
  metasets,
  substatColors,
  useStatButtonColors,
  recipes,
  onInsertSafeguard,
  onApplySafeguard,
  onResetSafeguard,
  onScaffoldFromRecipe,
  registerAutoApplyHandler,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoPreview,
  redoPreview,
  historyTimeline,
  onJumpToHistoryIndex,
  onRequestClearHistory,
  onManageMetasets,
}: SafeguardBuilderPanelProps) {
  const { t, lang } = useI18n()
  const theme = useTheme()
  const builderStatusChipSx = useMemo(() => createBuilderStatusChipSx(theme), [theme])
  const { showFactionIcons, showSetIcons, showSlotIcons } = useDisplayPreferences()
  const { resolveAllowedSetPool, sanitizeCombinationForSlots } = useKeepOverrideCombinationTools(metasets)

  // ── auto-apply / auto-reset preferences (shared with recipe builder) ───────
  const [autoResetAfterInsert, setAutoResetAfterInsert] = useAutoResetAfterInsertPreference()
  const [autoApplySelectedRecipe, setAutoApplySelectedRecipe] = useAutoApplySelectedRecipePreference()

  const setAutoResetExclusive = useCallback((next: boolean) => {
    setAutoResetAfterInsert(next)
    if (next && autoApplySelectedRecipe) setAutoApplySelectedRecipe(false)
  }, [autoApplySelectedRecipe, setAutoResetAfterInsert, setAutoApplySelectedRecipe])

  const setAutoApplyExclusive = useCallback((next: boolean) => {
    setAutoApplySelectedRecipe(next)
    if (next && autoResetAfterInsert) setAutoResetAfterInsert(false)
  }, [autoResetAfterInsert, setAutoApplySelectedRecipe, setAutoResetAfterInsert])

  // ── undo/redo history context menu (mirrors RecipeBuilderPanel) ──────────
  const {
    undoTooltipText,
    redoTooltipText,
    historyMenuOpen,
    historyMenuAnchor,
    historyMenuPaperRef,
    historyMenuGuard,
    closeHistoryMenu,
    handleHistoryContextMenu,
    handleHistoryMouseMove,
    handleHistoryMouseLeave,
    handleHistoryMenuContextMenu,
    handleRequestClearHistory,
    handleHistoryEntrySelect,
    historyHintActive,
    historyHintPos,
  } = useBuilderHistoryMenu({ undoPreview, redoPreview, t, lang, onRequestClearHistory, onJumpToHistoryIndex })

  // ── action menus (Insert / Apply / Reset context menus + hover hints) ─────
  // Incremented whenever user defaults are saved/cleared so isDefaultRule re-evaluates.
  const [defaultsEpoch, setDefaultsEpoch] = useState(0)

  const isDefaultRule = useMemo(() => {
    void defaultsEpoch // recompute when user defaults change
    // Build effective defaults: user-saved if present, factory otherwise.
    const factory = createFactorySafeguardBuilderDefaults()
    let effectiveDefaults: Omit<SafeguardRule, 'id'> = factory
    try {
      const raw = localStorage.getItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY)
      if (raw) {
        const normalized = normalizeSafeguardRule(JSON.parse(raw))
        if (normalized) {
          const { id: _id, ...rest } = normalized
          effectiveDefaults = { ...factory, ...rest }
        }
      }
    } catch {}
    // Snapshot current rule fields in the same order as createFactorySafeguardBuilderDefaults.
    const currentSnapshot: Omit<SafeguardRule, 'id'> = {
      combination: rule.combination,
      name: rule.name ?? '',
      requiredCount: rule.requiredCount,
      activation: rule.activation,
      countMode: rule.countMode,
      ignorePreviousSafeguards: rule.ignorePreviousSafeguards,
      ignoreEquippedInCollection: rule.ignoreEquippedInCollection,
      ignoreEquippedInVault: rule.ignoreEquippedInVault,
      substats: rule.substats ?? [],
      substatMatch: rule.substatMatch ?? SafeguardSubstatMatch.Any,
      substatWeights: rule.substatWeights ?? {},
    }
    return JSON.stringify(currentSnapshot) === JSON.stringify(effectiveDefaults)
  }, [rule, defaultsEpoch])

  const [builderCollapsed, setBuilderCollapsed] = useBuilderSafeguardCollapsedPreference()

  const BuilderSectionToggle = ({ id }: { id: typeof BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS[number] }) => {
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      const nextValue = !builderCollapsed[id]
      if (event.ctrlKey || event.metaKey) {
        const nextAll = { ...builderCollapsed }
        for (const k of BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS) nextAll[k] = nextValue
        setBuilderCollapsed(nextAll)
      } else {
        setBuilderCollapsed({ ...builderCollapsed, [id]: nextValue })
      }
    }
    const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const nextValue = !builderCollapsed[id]
      const nextAll = { ...builderCollapsed }
      for (const k of BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS) nextAll[k] = nextValue
      setBuilderCollapsed(nextAll)
    }
    return (
      <IconButton size="small" onClick={handleClick} onContextMenu={handleContextMenu} aria-label={builderCollapsed[id] ? 'Expand' : 'Collapse'}>
        {builderCollapsed[id] ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
      </IconButton>
    )
  }

  const applyDisabled = editingRuleId === null

  const {
    insert: {
      menu: { anchor: insertMenuAnchor, paperRef: insertMenuPaperRef, close: closeInsertMenu, onContextMenu: handleInsertContextMenu },
      hint: { active: insertHintActive, pos: insertHintPos, onMouseEnter: handleInsertHintMouseEnter, onMouseMove: handleInsertHintMouseMove, onMouseLeave: handleInsertHintMouseLeave },
    },
    apply: {
      menu: { anchor: applyMenuAnchor, paperRef: applyMenuPaperRef, close: closeApplyMenu, onContextMenu: handleApplyContextMenu },
      hint: { active: applyHintActive, pos: applyHintPos, onMouseEnter: handleApplyHintMouseEnter, onMouseMove: handleApplyHintMouseMove, onMouseLeave: handleApplyHintMouseLeave },
    },
    reset: {
      menu: { anchor: resetMenuAnchor, paperRef: resetMenuPaperRef, close: closeResetMenu, onContextMenu: handleResetContextMenu },
      hint: { active: resetHintActive, pos: resetHintPos, onMouseEnter: handleResetHintMouseEnter, onMouseMove: handleResetHintMouseMove, onMouseLeave: handleResetHintMouseLeave },
    },
  } = useBuilderPanelActionMenus({
    builderCanAdd: true,
    multiEditActive: false,
    saveDisabled: applyDisabled,
    isDefaultBuilder: isDefaultRule,
  })

  // Register auto-apply handler so selection changes can trigger it.
  useEffect(() => {
    if (!registerAutoApplyHandler) return
    registerAutoApplyHandler(() => {
      if (!autoApplySelectedRecipe) return false
      if (editingRuleId === null) return false
      onApplySafeguard()
      return true
    })
    return () => { registerAutoApplyHandler(null) }
  }, [registerAutoApplyHandler, autoApplySelectedRecipe, editingRuleId, onApplySafeguard])

  const ruleModeScopeTooltip = useMemo(() => (
    `${t('safeguardsRuleModeHint')}\n\n${t('safeguardsCountModeHint')}\n\n${t('safeguardsSubstatModeHint')}\n\n${t('safeguardsIgnoreOptionsHint')}`
  ), [t])

  const substatMatchLabels = useMemo(() => ({
    [SafeguardSubstatMatch.Any]: t('safeguardsSubstatRequirementAny'),
    [SafeguardSubstatMatch.All]: t('safeguardsSubstatRequirementAll'),
    [SafeguardSubstatMatch.PerSubstat]: t('safeguardsSubstatRequirementPer'),
  }), [t])

  const substatMatchOptions = useMemo(() => ([
    SafeguardSubstatMatch.Any,
    SafeguardSubstatMatch.All,
    SafeguardSubstatMatch.PerSubstat,
  ]), [])

  const safeguardScopeChipTooltips = useMemo(() => ({
    perSlot: t('safeguardsCountModePerSlotHint'),
    perSet: t('safeguardsCountModePerSetHint'),
    perFaction: t('safeguardsCountModePerFactionHint'),
    perMainStat: t('safeguardsCountModePerMainHint'),
  }), [t])

  // ── slot metrics — SSOT resolver shared with RecipeBuilderPanel and SafeguardChipsPanel ──
  const slotMetrics = useSlotMetrics()
  // slotLabel is now owned by the hook; no local switch/case needed.
  const { slotLabel } = slotMetrics

  // ── state helpers ─────────────────────────────────────────────────────────

  const [weightsAnchorEl, setWeightsAnchorEl] = useState<HTMLElement | null>(null)
  const [scaffoldAnchorEl, setScaffoldAnchorEl] = useState<HTMLElement | null>(null)
  // Tracks whether the Reset button is being hovered so all resettable sections
  // can show a red tint — mirrors RecipeBuilderPanel's hoverReset pattern.
  const [hoverReset, setHoverReset] = useState(false)
  const [scaffoldSearchText, setScaffoldSearchText] = useState('')
  const scaffoldMenuRef = React.useRef<HTMLDivElement | null>(null)
  const closeScaffoldMenu = useCallback(() => {
    setScaffoldAnchorEl(null)
    setScaffoldSearchText('')
  }, [])
  const { contextMenuGuard: scaffoldMenuGuard } = useContextMenuPaperGuard({
    open: scaffoldAnchorEl !== null,
    onClose: closeScaffoldMenu,
    menuRef: scaffoldMenuRef,
  })

  const filteredScaffoldEntries = useMemo(() => {
    const query = scaffoldSearchText.trim().toLowerCase()
    const hasQuery = query.length > 0
    return recipes
      .map((recipe, originalIdx) => {
        const isSep = recipe.exportMode === 'separator'
        const nameDecoration = isSep ? null : parseRecipeNameDirectives(recipe.name, '')
        const displayName = nameDecoration?.displayName.trim() ?? ''
        const nameColor = nameDecoration?.hasExplicitColor ? nameDecoration.resolvedColor : undefined
        return { recipe, originalIdx, displayName, nameColor }
      })
      .filter(({ recipe, displayName }) => {
        if (recipe.exportMode === 'separator') return !hasQuery
        if (!hasQuery) return true
        return displayName.toLowerCase().includes(query)
      })
  }, [recipes, scaffoldSearchText])

  const updateRule = useCallback((updater: (prev: SafeguardRule) => SafeguardRule) => {
    onChange((prev) => updater(prev))
  }, [onChange])

  const combination = rule.combination
  const activation = rule.activation

  const slotSelection = combination.slots
  const hasAccessorySlot = slotSelectionAllowsAccessories(slotSelection)
  const allowedSetPool = resolveAllowedSetPool(slotSelection)
  const setSelection = normalizeArtifactSetSelections(combination.sets)
    .filter((entry) => allowedSetPool.includes(Number(entry.id)))
  const rankSelection = combination.ranks
  const raritySelection = combination.rarities
  const mainStatOptions = getMainStatOptionsForSlots(slotSelection)
  const mainStatSelection = dedupeNumericArray((combination.mainStats ?? []).filter((v) => mainStatOptions.includes(v)))
  const factionSelection = hasAccessorySlot ? dedupeNumericArray(combination.factions ?? []) : []

  const allowedSubstatOptions = resolveAllowedSubstatsForSlotsAndMains({
    slots: slotSelection,
    mainStats: mainStatSelection,
  })
  const substatSelection = sortSafeguardSubstats((rule?.substats ?? []).filter((v) => allowedSubstatOptions.includes(v)))
  const hasSubstatSelection = substatSelection.length > 0
  const effectiveSubstatMatch = hasSubstatSelection
    ? normalizeSafeguardSubstatMatch(rule?.substatMatch)
    : SafeguardSubstatMatch.Any
  // SSOT: delegate to safeguardWeightsEnabled so the rule is defined once.
  const showSubstatWeights = safeguardWeightsEnabled(rule?.substatMatch, hasSubstatSelection)

  const countMode = sanitizeSafeguardCountMode(rule?.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE)
  const effectiveCountMode = hasAccessorySlot
    ? countMode
    : sanitizeSafeguardCountMode({ ...countMode, perFaction: false })
  const scopeActive = resolveKeepOverrideScopeActive(effectiveCountMode)

  const ignorePreviousSafeguards = rule?.ignorePreviousSafeguards !== false
  const ignoreEquippedInCollection = rule?.ignoreEquippedInCollection === true
  const ignoreEquippedInVault = rule?.ignoreEquippedInVault === true

  const handleScopeChipToggle = (scope: KeepOverrideScopeKey) => {
    updateRule((prev) => {
      const prevMode = prev.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE
      const nextMode = toggleKeepOverrideCountMode(prevMode, scope)
      return { ...prev, countMode: nextMode }
    })
  }

  const renderScopeChip = (
    scope: KeepOverrideScopeKey,
    label: string,
    active: boolean,
    disabledOverride = false,
  ) => (
    <MarkdownTooltip key={scope} markdown={safeguardScopeChipTooltips[scope]}>
      <span>
        <KeepOverrideScopeChip
          scope={scope}
          label={label}
          active={active}
          disabled={disabledOverride}
          onToggle={handleScopeChipToggle}
        />
      </span>
    </MarkdownTooltip>
  )

  const setRuleCombination = (updater: (combination: SafeguardRule['combination']) => SafeguardRule['combination']) => {
    updateRule((prev) => {
      const nextCombination = sortSafeguardCombination(updater(prev.combination))
      return { ...prev, combination: nextCombination }
    })
  }

  // Shared onChange for main-stat ToggleButtonGroup rows.
  // MUI passes the full updated value array (preserving values from the other row).
  const handleMainStatChange = (_: React.SyntheticEvent, nextValues: string[]) => {
    if (!Array.isArray(nextValues)) return
    const nextMain = dedupeNumericArray(
      nextValues.map(Number).filter((n) => Number.isFinite(n) && mainStatOptions.includes(n)),
    )
    updateRule((prev) => constrainSafeguardSubstats(prev, { ...prev.combination, mainStats: nextMain }))
  }

  // Shared onChange for substat ToggleButtonGroup rows.
  const handleSubstatChange = (_: React.SyntheticEvent, nextValues: string[]) => {
    if (!Array.isArray(nextValues)) return
    const sorted = sortSafeguardSubstats(
      dedupeNumericArray(
        nextValues.map(Number).filter((n) => Number.isFinite(n) && allowedSubstatOptions.includes(n as StatVariant)),
      ) as StatVariant[],
    )
    // Weights are irrelevant with no substats — close the popover immediately so
    // it does not stay open after the last substat is deselected.
    if (sorted.length === 0) setWeightsAnchorEl(null)
    updateRule((prev) => {
      const nextMatch = sorted.length > 0 ? prev.substatMatch : SafeguardSubstatMatch.Any
      const nextWeights = pruneSafeguardsSubstatWeights(prev.substatWeights, sorted)
      return { ...prev, substats: sorted, substatMatch: nextMatch, substatWeights: nextWeights }
    })
  }

  const mainStatValueStrings = mainStatSelection.map(String)
  const substatValueStrings = substatSelection.map(String)

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Box
      data-tour-id="safeguards.builder"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
        columnGap: 1,
        rowGap: 2,
      }}
    >

      {/* ── Row 0: Rule name (full-width) ─── */}
      <Box sx={(theme) => ({ gridColumn: '1 / -1', borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
        <TextField
          label={t('safeguardBuilderRuleName')}
          value={rule.name ?? ''}
          onChange={(e) => updateRule((prev) => ({ ...prev, name: e.target.value }))}
          InputProps={{
            endAdornment: rule.name ? (
              <InputAdornment position="end">
                <ClearIconButton
                  size="small"
                  edge="end"
                  aria-label={t('builderClearRecipeName')}
                  tooltip={t('builderClearRecipeName')}
                  onClick={() => updateRule((prev) => ({ ...prev, name: '' }))}
                />
              </InputAdornment>
            ) : undefined,
          }}
          fullWidth
        />
      </Box>

      {/* ── Row 1: Mode toggle + Required count + Ignore chips + undo/redo (full-width) ── */}
      <Box sx={{
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 1.5,
        flexWrap: 'wrap',
      }}>
        {/* Mode toggle with label */}
        <FormControl sx={(theme) => ({ flex: '0 0 auto', borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('safeguardsRuleModeLabel')}</Box>
            </FormLabel>
            <MarkdownTooltip markdown={ruleModeScopeTooltip}>
              <IconButton
                size="small"
                color="inherit"
                aria-label={t('safeguardsRuleModeHintLabel')}
                sx={{ p: 0.25, fontSize: 16, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
              >
                <InfoOutlinedIcon fontSize="inherit" />
              </IconButton>
            </MarkdownTooltip>
          </Box>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={activation}
            onChange={(_event, next) => {
              if (!next) return
              updateRule((prev) => (prev.activation === next ? prev : { ...prev, activation: next }))
            }}
            sx={{ borderRadius: '8px', overflow: 'hidden' }}
          >
            <ToggleButton value={SafeguardRuleActivation.Off} aria-label={t('safeguardsRuleModeOff')} sx={{ flex: 1, minWidth: 0, px: 1.5 }}>
              {t('safeguardsRuleModeOffShort')}
            </ToggleButton>
            <ToggleButton
              value={SafeguardRuleActivation.ProtectExisting}
              aria-label={t('safeguardsRuleModeProtect')}
              sx={(muiTheme) => ({
                flex: 1,
                minWidth: 0,
                px: 1.5,
                '&.Mui-selected': {
                  bgcolor: muiTheme.palette.success.main,
                  borderColor: muiTheme.palette.success.main,
                  color: muiTheme.palette.common.black,
                  '&:hover': { bgcolor: muiTheme.palette.success.light },
                },
              })}
            >
              {t('safeguardsRuleModeProtectShort')}
            </ToggleButton>
            <ToggleButton
              value={SafeguardRuleActivation.AnticipateGaps}
              aria-label={t('safeguardsRuleModeAnticipate')}
              sx={(muiTheme) => ({
                flex: 1,
                minWidth: 0,
                px: 1.5,
                '&.Mui-selected': {
                  bgcolor: muiTheme.palette.warning.main,
                  borderColor: muiTheme.palette.warning.main,
                  color: muiTheme.palette.getContrastText(muiTheme.palette.warning.main),
                  '&:hover': { bgcolor: muiTheme.palette.warning.dark },
                },
              })}
            >
              {t('safeguardsRuleModeAnticipateShort')}
            </ToggleButton>
          </ToggleButtonGroup>
        </FormControl>

        {/* Required count */}
        <Box sx={(theme) => ({ flex: '0 0 auto', borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
          <TextField
            size="small"
            type="number"
            label={t('safeguardsRequiredCount')}
            value={rule.requiredCount ?? 1}
            onChange={(event) => {
              const raw = Math.min(9999, Math.max(1, Math.floor(Number(event.target.value) || 1)))
              updateRule((prev) => ({ ...prev, requiredCount: raw }))
            }}
            InputProps={{
              startAdornment: <InputAdornment position="start">≥</InputAdornment>,
              endAdornment: (
                <NumberSpinnerAdornment
                  ariaLabel={t('safeguardsRequiredCount')}
                  onStep={(delta) => {
                    updateRule((prev) => {
                      const next = Math.max(1, Math.min(9999, Math.floor((prev.requiredCount ?? 1) + delta)))
                      return { ...prev, requiredCount: next }
                    })
                  }}
                />
              ),
            }}
            sx={(themeInner) => ({
              width: 130,
              '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
              '& input[type=number]': { MozAppearance: 'textfield' },
              '& input': { textAlign: 'right', paddingRight: themeInner.spacing(1), paddingLeft: themeInner.spacing(0.5) },
            })}
            inputProps={{ min: 1, step: 1, max: 9999 }}
          />
        </Box>

        {/* Ignore chips — right of required count, stacked in 2 rows */}
        <Box sx={(theme) => ({ display: 'flex', flexDirection: 'column', gap: 0.75, flex: '1 1 auto', ...SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
          {/* Row 1: ignore previous safeguards */}
          <Box sx={{ display: 'flex' }}>
            <MarkdownTooltip markdown={t('safeguardsIgnorePreviousSafeguardsHint')} ellipsisTitle={t('safeguardsIgnorePreviousSafeguards')} ellipsisSelector=".MuiChip-label">
              <Chip
                size="small"
                variant="filled"
                label={t('safeguardsIgnorePreviousSafeguards')}
                aria-label={t('safeguardsIgnorePreviousSafeguards')}
                clickable
                onClick={() => {
                  updateRule((prev) => ({ ...prev, ignorePreviousSafeguards: !ignorePreviousSafeguards }))
                }}
                sx={builderStatusChipSx(ignorePreviousSafeguards, { dimDisabled: true })}
              />
            </MarkdownTooltip>
          </Box>
          {/* Row 2: ignore equipped in collection + vault */}
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            <MarkdownTooltip markdown={t('safeguardsIgnoreEquippedInCollectionHint')} ellipsisTitle={t('safeguardsIgnoreEquippedInCollection')} ellipsisSelector=".MuiChip-label">
              <Chip
                size="small"
                variant="filled"
                label={t('safeguardsIgnoreEquippedInCollection')}
                aria-label={t('safeguardsIgnoreEquippedInCollection')}
                clickable
                onClick={() => {
                  updateRule((prev) => ({ ...prev, ignoreEquippedInCollection: !ignoreEquippedInCollection }))
                }}
                sx={builderStatusChipSx(ignoreEquippedInCollection, { dimDisabled: true })}
              />
            </MarkdownTooltip>
            <MarkdownTooltip markdown={t('safeguardsIgnoreEquippedInVaultHint')} ellipsisTitle={t('safeguardsIgnoreEquippedInVault')} ellipsisSelector=".MuiChip-label">
              <Chip
                size="small"
                variant="filled"
                label={t('safeguardsIgnoreEquippedInVault')}
                aria-label={t('safeguardsIgnoreEquippedInVault')}
                clickable
                onClick={() => {
                  updateRule((prev) => ({ ...prev, ignoreEquippedInVault: !ignoreEquippedInVault }))
                }}
                sx={builderStatusChipSx(ignoreEquippedInVault, { dimDisabled: true })}
              />
            </MarkdownTooltip>
          </Box>
        </Box>
        {/* Undo / Redo — right-aligned, mirrors RecipeBuilderPanel position + right-click history */}
        <Box
          sx={{ ml: 'auto', display: 'flex', alignItems: 'flex-end', gap: 0.5, flexShrink: 0, pb: 0, position: 'relative' }}
          onContextMenu={handleHistoryContextMenu}
          onMouseMove={handleHistoryMouseMove}
          onMouseLeave={handleHistoryMouseLeave}
        >
          <MarkdownTooltip
            render={<BuilderTooltipContent text={undoTooltipText} colorizeStats substatColors={substatColors} />}
            slotProps={{ tooltip: { sx: { maxWidth: HISTORY_TOOLTIP_MAX_WIDTH_PX } } }}
          >
            <span>
              <IconButton
                size="small"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label={t('builderUndo')}
                sx={{ width: SMALL_BUTTON_HEIGHT_PX, height: SMALL_BUTTON_HEIGHT_PX }}
              >
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </MarkdownTooltip>
          <MarkdownTooltip
            render={<BuilderTooltipContent text={redoTooltipText} colorizeStats substatColors={substatColors} />}
            slotProps={{ tooltip: { sx: { maxWidth: HISTORY_TOOLTIP_MAX_WIDTH_PX } } }}
          >
            <span>
              <IconButton
                size="small"
                onClick={onRedo}
                disabled={!canRedo}
                aria-label={t('builderRedo')}
                sx={{ width: SMALL_BUTTON_HEIGHT_PX, height: SMALL_BUTTON_HEIGHT_PX }}
              >
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </MarkdownTooltip>
          <ContextMenuHintOverlay text={t('contextMenuHint')} position={historyHintActive ? historyHintPos : null} />
          <HistoryContextMenu
            open={historyMenuOpen}
            anchorPosition={historyMenuAnchor}
            onClose={closeHistoryMenu}
            paperRef={historyMenuPaperRef}
            onPaperContextMenu={handleHistoryMenuContextMenu}
            contextMenuGuard={historyMenuGuard}
            entries={historyTimeline}
            t={t}
            lang={lang}
            onSelectEntry={handleHistoryEntrySelect}
            onRequestClearHistory={handleRequestClearHistory}
            substatColors={substatColors}
          />
        </Box>
      </Box>

      {/* ── Row 2 left: Rank | Rarity | Faction (nested 3-col, mirrors BuilderPanel) ── */}
      <Box sx={(theme) => ({
        gridColumn: '1 / 3',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))',
        columnGap: 1,
        rowGap: 2,
        borderRadius: 1,
        transition: UI_BG_HOVER_DANGER_TRANSITION,
        backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent',
      })}>

        {/* Rank */}
        <FormControl fullWidth>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="rank" />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderRank')}</Box>
            </FormLabel>
          </Box>
          <Collapse in={!builderCollapsed.rank} timeout="auto" unmountOnExit>
            <GearRankSelect
              multiple
              value={rankSelection}
              onChange={(nextRanks) => {
                setRuleCombination((prev) => ({ ...prev, ranks: nextRanks }))
              }}
              allowAny
              anyLabel={t('any')}
              menuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
              sx={SELECT_BOX_HEIGHT_SX}
            />
          </Collapse>
        </FormControl>

        {/* Rarity */}
        <FormControl fullWidth>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="rarity" />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('filterRarity')}</Box>
            </FormLabel>
          </Box>
          <Collapse in={!builderCollapsed.rarity} timeout="auto" unmountOnExit>
            <GearRaritySelect
              multiple
              value={raritySelection}
              onChange={(nextRarities) => {
                setRuleCombination((prev) => ({ ...prev, rarities: nextRarities }))
              }}
              allowAny
              anyLabel={t('any')}
              menuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
              sx={SELECT_BOX_HEIGHT_SX}
            />
          </Collapse>
        </FormControl>

        {/* Faction + perFaction chip — chip collapses with the select since it belongs to this section */}
        <FormControl fullWidth disabled={!hasAccessorySlot}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="faction" />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderFaction')}</Box>
            </FormLabel>
          </Box>
          <Collapse in={!builderCollapsed.faction} timeout="auto" unmountOnExit>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <GearFactionSelect
                multiple
                disabled={!hasAccessorySlot}
                value={factionSelection}
                onChange={(nextFactions) => {
                  if (!hasAccessorySlot) return
                  setRuleCombination((prev) => ({ ...prev, factions: nextFactions }))
                }}
                anyLabel={t('any')}
                sx={SELECT_BOX_HEIGHT_SX}
              />
              {renderScopeChip('perFaction', `${GLYPH_PER_FACTION}${NBSP}${t('safeguardsCountModePerFaction')}`, scopeActive.perFaction, !hasAccessorySlot)}
            </Box>
          </Collapse>
        </FormControl>
      </Box>


      {/* ── Row 3 left: Main stat + perMainStat chip ──────────────────────── */}
      <Box sx={(theme) => ({ gridColumn: '1 / 3', display: 'flex', flexDirection: 'column', gap: 0.75, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="mainStat" />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderMain')}</Box>
            </FormLabel>
            {mainStatSelection.length > 0
              ? (
                <ClearIconButton
                  size="small"
                  aria-label={t('builderClearMainStats')}
                  tooltip={t('builderClearMainStats')}
                  onClick={() => {
                    updateRule((prev) => constrainSafeguardSubstats(prev, { ...prev.combination, mainStats: [] }))
                  }}
                />
              )
              : <Box sx={CLEAR_PLACEHOLDER_SX} />
            }
          </Box>
          <Collapse in={!builderCollapsed.mainStat} timeout="auto" unmountOnExit>
            {/* Toggle rows + perMainStat chip collapse together as a unit */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {/* Row 1: SPD, CR%, CDMG%, ACC, RES */}
              <ToggleButtonGroup
                size="small"
                value={mainStatValueStrings}
                onChange={handleMainStatChange}
                sx={mainStatToggleGroupSx}
              >
                {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => (
                  <ToggleButton
                    key={variant}
                    value={String(variant)}
                    disabled={!mainStatOptions.includes(variant)}
                  >
                    {t(statVariantI18nKey(variant))}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
              <ToggleButtonGroup
                size="small"
                value={mainStatValueStrings}
                onChange={handleMainStatChange}
                sx={mainStatToggleGroupSx}
              >
                {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => (
                  <ToggleButton
                    key={variant}
                    value={String(variant)}
                    disabled={!mainStatOptions.includes(variant)}
                  >
                    {t(statVariantI18nKey(variant))}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {renderScopeChip('perMainStat', `${GLYPH_PER_MAIN_STAT}${NBSP}${t('safeguardsCountModePerMain')}`, scopeActive.perMainStat)}
            </Box>
          </Collapse>
        </FormControl>
      </Box>

      {/* ── Row 3 right: Substats + match chips + weights ─────────────────── */}
      <Box sx={(theme) => ({ gridColumn: '3 / 5', display: 'flex', flexDirection: 'column', gap: 0.75, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="substats" />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderSubstats')}</Box>
            </FormLabel>
            {substatSelection.length > 0
              ? (
                <ClearIconButton
                  size="small"
                  aria-label={t('clear')}
                  tooltip={t('clear')}
                  onClick={() => {
                    updateRule((prev) => ({ ...prev, substats: [], substatMatch: SafeguardSubstatMatch.Any, substatWeights: {} }))
                  }}
                />
              )
              : <Box sx={CLEAR_PLACEHOLDER_SX} />
            }
          </Box>
          <Collapse in={!builderCollapsed.substats} timeout="auto" unmountOnExit>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {/* Row 1: SPD, CR%, CDMG%, ACC, RES */}
              <ToggleButtonGroup
                size="small"
                value={substatValueStrings}
                onChange={handleSubstatChange}
                sx={substatToggleGroupSx}
              >
                {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => (
                  <ToggleButton
                    key={variant}
                    value={String(variant)}
                    disabled={!allowedSubstatOptions.includes(variant)}
                  >
                    {t(statVariantI18nKey(variant))}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
              <ToggleButtonGroup
                size="small"
                value={substatValueStrings}
                onChange={handleSubstatChange}
                sx={substatToggleGroupSx}
              >
                {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => (
                  <ToggleButton
                    key={variant}
                    value={String(variant)}
                    disabled={!allowedSubstatOptions.includes(variant)}
                  >
                    {t(statVariantI18nKey(variant))}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          </Collapse>
        </FormControl>
        {/* Substat match mode chips + weights button */}
        <Collapse in={!builderCollapsed.substats} timeout="auto" unmountOnExit>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', ...SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX }}>
          <MarkdownTooltip markdown={t('safeguardsSubstatRequirementHint')}>
            <Box component="span" sx={{ display: 'inline-flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', ...SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX }}>
              {substatMatchOptions.map((option) => {
                const active = effectiveSubstatMatch === option
                // Prefix PerSubstat with the per-dim glyph so it visually matches scope chips.
                const baseLabel = substatMatchLabels[option] ?? substatMatchLabels[SafeguardSubstatMatch.Any]
                const label = option === SafeguardSubstatMatch.PerSubstat ? `${GLYPH_PER_SUBSTAT}${NBSP}${baseLabel}` : baseLabel
                return (
                  <EllipsisTooltip key={option} title={label} selector=".MuiChip-label">
                    <Chip
                      size="small"
                      variant="filled"
                      label={label}
                      aria-label={t('safeguardsSubstatRequirementLabel')}
                      clickable
                      disabled={!hasSubstatSelection}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (!hasSubstatSelection) return
                        if (option === effectiveSubstatMatch) return
                        // Per Substat disables weights — close the popover immediately
                        // so it doesn't stay open behind the new mode.
                        if (option === SafeguardSubstatMatch.PerSubstat) setWeightsAnchorEl(null)
                        updateRule((prev) => ({ ...prev, substatMatch: option }))
                      }}
                      sx={builderStatusChipSx(active, { dimDisabled: true })}
                    />
                  </EllipsisTooltip>
                )
              })}
            </Box>
          </MarkdownTooltip>
          {/* Weights button — always visible, disabled when no substats or PerSubstat mode */}
          <IconButton
            size="small"
            aria-label={t('safeguardsSubstatWeightsLabel')}
            disabled={!hasSubstatSelection || !showSubstatWeights}
            onClick={(e) => setWeightsAnchorEl(e.currentTarget)}
            sx={{ p: 0.25, color: hasSubstatSelection && Object.keys(rule.substatWeights ?? {}).length > 0 ? 'primary.main' : 'text.secondary' }}
          >
            <TuneIcon fontSize="small" />
          </IconButton>
        </Box>
        </Collapse>
      </Box>

      {/* ── Row 4 left: Slots icon grid + perSlot chip ────────────────────── */}
      <Box sx={(theme) => ({ gridColumn: '1 / 3', display: 'flex', flexDirection: 'column', gap: 0.75, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="slots" />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderSlots')}</Box>
            </FormLabel>
            {slotSelection.length > 0
              ? (
                <ClearIconButton
                  size="small"
                  aria-label={t('builderClearSlots')}
                  tooltip={t('builderClearSlots')}
                  onClick={() => {
                    updateRule((prev) => {
                      const nextCombination = sanitizeCombinationForSlots([], prev.combination)
                      return constrainSafeguardSubstats(prev, nextCombination)
                    })
                  }}
                />
              )
              : <Box sx={CLEAR_PLACEHOLDER_SX} />
            }
          </Box>
          <Collapse in={!builderCollapsed.slots} timeout="auto" unmountOnExit>
            {/* Slot grid and perSlot chip collapse together as a unit */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
                {artifactTypeIconList.map(({ id, Icon }) => {
                  const selected = slotSelection.includes(id)
                  return (
                    <ToggleButton
                      key={id}
                      value={`${id}`}
                      selected={selected}
                      onClick={() => {
                        updateRule((prev) => {
                          const set = new Set(prev.combination.slots)
                          if (set.has(id)) set.delete(id); else set.add(id)
                          const nextCombination = sanitizeCombinationForSlots(Array.from(set), prev.combination)
                          return constrainSafeguardSubstats(prev, nextCombination)
                        })
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        minWidth: 0,
                        height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
                        px: 1,
                        py: 0,
                        textTransform: 'none',
                        gap: slotMetrics.iconGapCss,
                        borderRadius: 1,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: slotMetrics.contentWidthPx ?? 'auto',
                          maxWidth: '100%',
                          height: '100%',
                        }}
                      >
                        <Box
                          component="span"
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            width: slotMetrics.iconSizePx,
                            minWidth: slotMetrics.iconSizePx,
                            mr: slotMetrics.iconGapCss,
                          }}
                        >
                          <Icon fontSize="small" />
                        </Box>
                        <Typography
                          variant="button"
                          component="span"
                          sx={(themeCtx) => ({
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            minWidth: slotMetrics.labelFlexBasis,
                            flex: slotMetrics.labelFlexBasis ? `0 0 ${slotMetrics.labelFlexBasis}` : undefined,
                            fontSize: FONT_SIZE_BASE_PX,
                            fontFamily: themeCtx.typography.button?.fontFamily ?? themeCtx.typography.fontFamily,
                            fontWeight: themeCtx.typography.button?.fontWeight ?? themeCtx.typography.fontWeightMedium ?? 500,
                            letterSpacing: themeCtx.typography.button?.letterSpacing,
                            lineHeight: themeCtx.typography.button?.lineHeight ?? 1.2,
                          })}
                        >
                          {slotLabel(Number(id))}
                        </Typography>
                      </Box>
                    </ToggleButton>
                  )
                })}
              </Box>
              {renderScopeChip('perSlot', `${GLYPH_PER_SLOT}${NBSP}${t('safeguardsCountModePerSlot')}`, scopeActive.perSlot)}
            </Box>
          </Collapse>
        </FormControl>
      </Box>

      {/* ── Row 4 right: Sets selector + perSet chip ──────────────────────── */}
      <Box sx={(theme) => ({ gridColumn: '3 / 5', display: 'flex', flexDirection: 'column', gap: 0.75, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
        <FormControl fullWidth>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="sets" />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderSets')}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }} />
              <MarkdownTooltip markdown={t('builderManageMetasetsTooltip')}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onManageMetasets}
                  sx={{ minWidth: 160, whiteSpace: 'nowrap', ml: 'auto', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  <Box component="span" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t('builderManageMetasetsButton')}
                  </Box>
                </Button>
              </MarkdownTooltip>
            </FormLabel>
          </Box>
          <Collapse in={!builderCollapsed.sets} timeout="auto" unmountOnExit>
            {/* Sets selector and perSet chip collapse together as a unit */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <GearSetsSelect
                value={setSelection}
                onChange={(nextSets) => {
                  setRuleCombination((prev) => ({ ...prev, sets: normalizeArtifactSetSelections(nextSets) }))
                }}
                metasets={metasets}
                selectedMetasetIds={combination.metaSetIds}
                onChangeMetasetIds={(nextMetaIds) => {
                  setRuleCombination((prev) => ({ ...prev, metaSetIds: dedupeStringArray(nextMetaIds) }))
                }}
                allowedSetIds={allowedSetPool}
                showMetasets
                layoutVersion={1}
                anyLabel={t('anySet')}
                includeNoSet={hasAccessorySlot}
              />
              {renderScopeChip('perSet', `${GLYPH_PER_SET}${NBSP}${t('safeguardsCountModePerSet')}`, scopeActive.perSet)}
            </Box>
          </Collapse>
        </FormControl>
      </Box>

      {/* ── Insert / Apply / Reset buttons + Scaffold (mirrors recipe builder) ── */}
      <Box sx={{ gridColumn: '1 / -1' }}>
        <Divider sx={{ my: 1, opacity: 0.5 }} />
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Insert button */}
          <Box
            component="span"
            onContextMenu={handleInsertContextMenu}
            onMouseEnter={handleInsertHintMouseEnter}
            onMouseMove={handleInsertHintMouseMove}
            onMouseLeave={handleInsertHintMouseLeave}
            sx={{ display: 'inline-flex' }}
          >
            <Button
              startIcon={<PlaylistAddIcon fontSize="small" />}
              sx={{ whiteSpace: 'nowrap', gap: 0.75, '& .MuiButton-startIcon': { marginLeft: 0, marginRight: 0 } }}
              onClick={() => {
                onInsertSafeguard()
                if (autoResetAfterInsert) onResetSafeguard()
              }}
            >
              {editingRuleIndex !== null ? t('safeguardsBuilderInsertAs', { n: editingRuleIndex + 2 }) : t('safeguardsAddRule')}
            </Button>
          </Box>

          {/* Apply button */}
          <Box
            component="span"
            onContextMenu={handleApplyContextMenu}
            onMouseEnter={handleApplyHintMouseEnter}
            onMouseMove={handleApplyHintMouseMove}
            onMouseLeave={handleApplyHintMouseLeave}
            sx={{ display: 'inline-flex' }}
          >
            <Button
              startIcon={<PlaylistAddCheckIcon fontSize="small" />}
              disabled={applyDisabled}
              sx={{ whiteSpace: 'nowrap', gap: 0.75, '& .MuiButton-startIcon': { marginLeft: 0, marginRight: 0 } }}
              onClick={() => { if (!applyDisabled) onApplySafeguard() }}
            >
              {editingRuleIndex !== null ? t('safeguardsBuilderApplyAs', { n: editingRuleIndex + 1 }) : t('safeguardsBuilderApply')}
            </Button>
          </Box>

          {/* Scaffold from Recipe */}
          <Button
            variant="outlined"
            disabled={recipes.length === 0}
            sx={{ whiteSpace: 'nowrap' }}
            title={recipes.length === 0 ? t('safeguardsScaffoldFromRecipeEmpty') : undefined}
            onClick={(e) => setScaffoldAnchorEl(e.currentTarget)}
          >
            {t('safeguardsScaffoldFromRecipe')}
          </Button>

          {/* Spacer — pushes Reset to the right */}
          <Box sx={{ flex: 1 }} />

          {/* Reset button */}
          <Box
            component="span"
            onContextMenu={handleResetContextMenu}
            onMouseEnter={(e) => { setHoverReset(true); handleResetHintMouseEnter(e) }}
            onMouseMove={handleResetHintMouseMove}
            onMouseLeave={() => { setHoverReset(false); handleResetHintMouseLeave() }}
          >
            <Button
              size="small"
              color="warning"
              disabled={isDefaultRule}
              onClick={onResetSafeguard}
              sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX }}
            >
              {t('safeguardsBuilderReset')}
            </Button>
          </Box>
        </Stack>

        {/* Context menu hint overlays */}
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={insertHintActive ? insertHintPos : null} />
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={applyHintActive ? applyHintPos : null} />
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={resetHintActive ? resetHintPos : null} />

        {/* Insert context menu — auto reset after insert */}
        <Menu
          anchorEl={insertMenuAnchor}
          open={Boolean(insertMenuAnchor)}
          onClose={closeInsertMenu}
          PaperProps={{ ref: insertMenuPaperRef }}
        >
          <MenuItem onClick={() => { setAutoResetExclusive(!autoResetAfterInsert); closeInsertMenu() }}>
            <Checkbox size="small" checked={autoResetAfterInsert} onChange={() => {}} sx={{ mr: 1, p: 0.5 }} />
            {t('builderMenuAutoResetAfterInsert')}
          </MenuItem>
        </Menu>

        {/* Apply context menu — auto apply to selected */}
        <Menu
          anchorEl={applyMenuAnchor}
          open={Boolean(applyMenuAnchor)}
          onClose={closeApplyMenu}
          PaperProps={{ ref: applyMenuPaperRef }}
        >
          <MenuItem onClick={() => { setAutoApplyExclusive(!autoApplySelectedRecipe); closeApplyMenu() }}>
            <Checkbox size="small" checked={autoApplySelectedRecipe} onChange={() => {}} sx={{ mr: 1, p: 0.5 }} />
            {t('safeguardsBuilderMenuAutoApplySelected')}
          </MenuItem>
        </Menu>

        {/* Reset context menu — save user defaults or revert to factory, mirrors recipe builder */}
        <Menu
          anchorEl={resetMenuAnchor}
          open={Boolean(resetMenuAnchor)}
          onClose={closeResetMenu}
          PaperProps={{ ref: resetMenuPaperRef }}
        >
          {(() => { void defaultsEpoch; return null })()}
          <MenuItem
            onClick={() => {
              closeResetMenu()
              // Save current rule (minus id) as user defaults; if identical to factory, clear the override.
              const factory = createFactorySafeguardBuilderDefaults()
              const current: Omit<SafeguardRule, 'id'> = {
                combination: rule.combination,
                name: rule.name ?? '',
                requiredCount: rule.requiredCount,
                activation: rule.activation,
                countMode: rule.countMode,
                ignorePreviousSafeguards: rule.ignorePreviousSafeguards,
                ignoreEquippedInCollection: rule.ignoreEquippedInCollection,
                ignoreEquippedInVault: rule.ignoreEquippedInVault,
                substats: rule.substats ?? [],
                substatMatch: rule.substatMatch ?? SafeguardSubstatMatch.Any,
                substatWeights: rule.substatWeights ?? {},
              }
              const same = JSON.stringify(current) === JSON.stringify(factory)
              try {
                if (same) {
                  localStorage.removeItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY)
                } else {
                  // Store with a placeholder id so normalizeSafeguardRule can parse it on read.
                  localStorage.setItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY, JSON.stringify({ id: '__defaults__', ...current }))
                }
              } catch {}
              setDefaultsEpoch((x) => x + 1)
            }}
          >
            {t('builderMenuSaveUserDefaults')}
          </MenuItem>
          <MenuItem
            disabled={(() => { try { return !localStorage.getItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY) } catch { return true } })()}
            onClick={() => {
              closeResetMenu()
              // Apply factory defaults to the current draft (keeps the same id).
              const factory = createFactorySafeguardBuilderDefaults()
              onChange((prev) => ({ id: prev.id, ...factory }))
            }}
          >
            {t('builderMenuResetFactoryDefaults')}
          </MenuItem>
        </Menu>
      </Box>

      {/* ── Scaffold from Recipe popover ──────────────────────────────────── */}
      <Popover
        anchorEl={scaffoldAnchorEl}
        open={scaffoldAnchorEl !== null}
        onClose={closeScaffoldMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard: scaffoldMenuGuard,
            onRequestClose: closeScaffoldMenu,
            closeLabel: t('close'),
            ref: scaffoldMenuRef,
            sx: { width: 480, maxWidth: 'calc(100vw - 32px)', display: 'flex', flexDirection: 'column', maxHeight: 'min(460px, 80vh)' },
          }),
        }}
      >
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <InputBase
            autoFocus
            fullWidth
            placeholder={t('safeguardsScaffoldSearchPlaceholder')}
            value={scaffoldSearchText}
            onChange={(e) => setScaffoldSearchText(e.target.value)}
            inputProps={{ 'aria-label': t('safeguardsScaffoldSearchPlaceholder') }}
          />
        </Box>
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          {filteredScaffoldEntries.length === 0 && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t('safeguardsScaffoldNoMatch')}
              </Typography>
            </Box>
          )}
          {filteredScaffoldEntries.map(({ recipe, originalIdx, displayName, nameColor }) => {
            if (recipe.exportMode === 'separator') {
              const sepLabel = parseSeparatorLabel(recipe.name)
              return (
                <Box key={originalIdx} sx={{ py: 0.5, px: 1.5 }}>
                  <Divider>
                    {sepLabel ? (
                      <Typography variant="caption" sx={{ color: 'text.disabled', px: 0.5 }}>
                        {sepLabel}
                      </Typography>
                    ) : null}
                  </Divider>
                </Box>
              )
            }
            const isDisabled = recipe.exportMode === 'disabled'
            const recipeSummary = summaryParts(recipe, metasets, {
              substatColors,
              useStatButtonColors,
              showFactionIcons,
              showSetIcons,
              showSlotIcons,
              t,
              lang,
              tooltipsDisabled: true,
            })
            return (
              <ButtonBase
                key={originalIdx}
                onClick={() => {
                  closeScaffoldMenu()
                  onScaffoldFromRecipe(originalIdx)
                }}
                sx={{
                  display: 'flex',
                  width: '100%',
                  px: 1.5,
                  py: 0.75,
                  textAlign: 'left',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    opacity: isDisabled ? 0.55 : 1,
                  }}
                >
                  <Box component="span" sx={{ color: 'text.disabled', mr: 0.5 }}>
                    {originalIdx + 1}.
                  </Box>
                  <Box component="span" sx={{ color: recipe.keep ? 'success.main' : 'error.main', fontWeight: 700 }}>
                    {recipe.keep ? t('keepValueKeep') : t('keepValueSell')}
                  </Box>
                  {displayName ? (
                    <>
                      <Box component="span" sx={{ px: 0.25 }}>—</Box>
                      <Box component="span" sx={{ color: nameColor || undefined }}>
                        {displayName}
                      </Box>
                    </>
                  ) : null}
                  {recipeSummary && (
                    <>
                      {' | '}
                      {recipeSummary}
                    </>
                  )}
                </Typography>
              </ButtonBase>
            )
          })}
        </Box>
      </Popover>

      {/* ── Substat weights popover ──────────────────────────────────────── */}
      <Popover
        open={Boolean(weightsAnchorEl)}
        anchorEl={weightsAnchorEl}
        onClose={() => setWeightsAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 220 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.25 }}>
            {t('safeguardsSubstatWeightsLabel')}
          </Typography>
          {substatSelection.map((variant) => {
            const rawWeight = Number(rule?.substatWeights?.[variant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
            const weight = normalizeGearInspectorSortWeight(rawWeight)
            return (
              <Box key={variant} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t(statVariantI18nKey(variant))}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  <GearInspectorSortWeightControls
                    label={t(statVariantI18nKey(variant))}
                    enabled={true}
                    weight={weight}
                    onBump={(deltaSteps) => {
                      updateRule((prev) => {
                        const rawWeights = prev.substatWeights ?? {}
                        const currentRaw = Number(rawWeights[variant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
                        const current = normalizeGearInspectorSortWeight(currentRaw)
                        const nextValue = normalizeGearInspectorSortWeight(current + (deltaSteps * GEAR_INSPECTOR_SORT_WEIGHT_STEP))
                        const nextWeights = { ...rawWeights }
                        if (nextValue === GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT) {
                          delete nextWeights[variant]
                        } else {
                          nextWeights[variant] = nextValue
                        }
                        return { ...prev, substatWeights: nextWeights }
                      })
                    }}
                    onReset={() => {
                      updateRule((prev) => {
                        const rawWeights = prev.substatWeights ?? {}
                        if (!rawWeights[variant]) return prev
                        const nextWeights = { ...rawWeights }
                        delete nextWeights[variant]
                        return { ...prev, substatWeights: nextWeights }
                      })
                    }}
                  />
                </Box>
              </Box>
            )
          })}
        </Box>
      </Popover>

    </Box>
  )
}
