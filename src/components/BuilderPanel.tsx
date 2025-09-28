/**
 * BuilderPanel
 *
 * Main rule-builder UI. Edits a BuilderConfig, manages metasets and minima, and
 * previews generated HSF rules plus obsolete detection. Stateless except for
 * local UI state; all persisted state lives in App.
 */
import React, { useEffect, useRef, useState } from 'react'
import { rarityCodeToName, StatVariant, RankCode, RarityCode, Faction, filterAndSortSetEntries, statVariantI18nKey, artifactSetI18nKey } from '../lib/types'
import { NBSP } from '../lib/constants'
import SetMenuSection from './SetMenuSection'
import MetasetsDialog from './MetasetsDialog'
import { useMetasetsDialog } from '../hooks/useMetasetsDialog'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { buildHsfRules, LEVELS, type BuilderConfig, type MinimaTable } from '../lib/hsfBuilder'
import { isMilestoneThresholdsActive, normalizeKeepMode } from '../lib/keepMode'
import { findObsoleteRules } from '../lib/hsfObsolete'
import { type Metaset } from '../lib/metasets'



//

import { Box, Button, Divider, Stack, Typography, TextField, Chip, FormControl, FormLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, ListSubheader, InputAdornment, Menu } from '@mui/material'
import { keyframes } from '@emotion/react'
import SetsOrderControls from './SetsOrderControls'
import MinimaDialog from './MinimaDialog'
import type { SelectChangeEvent } from '@mui/material/Select'
import { IconButton, Tooltip, ToggleButton, ToggleButtonGroup } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { artifactTypeIconList } from './artifactTypeIcons'
import EllipsisTooltip from './EllipsisTooltip'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import BuilderCheatSheetPopover from './BuilderCheatSheetPopover'
import { SubstatToggleDisplay, substatToggleGroupSx } from './SubstatToggleDisplay'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined'
import ClearIcon from '@mui/icons-material/Clear'
import { UI_BG_HOVER_DANGER_TRANSITION, SETS_ORDER_KEY, LIST_SUBHEADER_SX, MENU_SELECTED_BG_ALPHA, MENU_SELECTED_BG_HOVER_ALPHA, MENU_MAX_HEIGHT_METASETS_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_SCROLL_GUTTER_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, SETS_MENU_WIDTH_PX, UI_SUBSTAT_WARNING_ROW_HEIGHT_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, BUILDER_USER_DEFAULTS_KEY, BUILDER_AUTO_RESET_AFTER_INSERT_KEY, BUILDER_ADD_BUTTON_WIDTH_PX, BUILDER_DIRTY_NUDGE_IDLE_MS, BUILDER_DIRTY_ATTENTION_INTERVAL_MS, FONT_SIZE_BASE_PX, ELLIPSIS_TEXT_SX, BUILDER_SLOT_LABEL_WIDTH_BUFFER_PX, BUILDER_TOGGLE_BUTTON_HEIGHT_PX, BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX, BUILDER_TOGGLE_BUTTON_ANY_MIN_WIDTH_PX } from '../lib/constants'
import Checkbox from '@mui/material/Checkbox'
import { useAttentionEffectStyles, useFortyTwoLegendaryOverlay } from '../lib/attentionEffects'
import { alpha, useTheme } from '@mui/material/styles'
import { useI18n, formatRulesCount } from '../lib/i18n'
export default function BuilderPanel({ cfg, onChange, onAddToCustom, editingIndex, onUpdateSelected, metasets, onMetasetsChange, onDeleteMetaset, minima, onMinimaChange, setUsageCounts, metasetUsageCounts, substatColors: _substatColors, hasAnyConfigs: _hasAnyConfigs, useStatButtonBorders: _useStatButtonBorders, selectedIsDirty, multiselectActive, onSelectConfigsByMetaset, minimaDialogOpen, onCloseMinimaDialog }: {
  cfg: BuilderConfig,
  onChange: (c: BuilderConfig) => void
  onAddToCustom: () => void
  editingIndex: number | null
  onUpdateSelected: () => void
  metasets: Metaset[]
  onMetasetsChange: (next: Metaset[]) => void
  onDeleteMetaset: (id: string, opts?: { replaceWithSets?: boolean; replaceWithMetaId?: string }) => void
  minima: MinimaTable
  onMinimaChange: (m: MinimaTable) => void
  setUsageCounts: Record<number, number>
  metasetUsageCounts: Record<string, number>
  substatColors: Record<number, { fg: string; bg: string }>
  hasAnyConfigs: boolean
  useStatButtonBorders: boolean
  selectedIsDirty: boolean
  multiselectActive: boolean
  // Select all configs that reference a given metaset ID (used from Metasets dialog "Used" chip)
  onSelectConfigsByMetaset: (id: string) => void
  minimaDialogOpen: boolean
  onCloseMinimaDialog: () => void
}) {
  const { t } = useI18n()
  const theme = useTheme()
  const substatColors = _substatColors
  // Localized label for rank/star options in the Rank select.
  // Uses i18n star keys so locales can customize the star text.
  const rankOptionLabel = (code: number): string => {
    const n = Number(code)
    type StarKey = 'star1' | 'star2' | 'star3' | 'star4' | 'star5' | 'star6'
    const starKey = (s: number): StarKey => {
      switch (s) {
        case 1: return 'star1'
        case 2: return 'star2'
        case 3: return 'star3'
        case 4: return 'star4'
        case 5: return 'star5'
        case 6: return 'star6'
        default: return 'star1'
      }
    }
    if (n === 0) return t('any')
    if (n >= 1 && n <= 6) return t(starKey(n))
    if (n >= 7 && n <= 11) return `≥${NBSP}${t(starKey(n - 6))}`
    if (n >= 12 && n <= 16) return `≤${NBSP}${t(starKey(n - 10))}`
    return String(n)
  }
  const slotLabel = React.useCallback((id: number): string => {
    switch (Number(id)) {
      case 5: return t('slotWeapon')
      case 1: return t('slotHelmet')
      case 6: return t('slotShield')
      case 3: return t('slotGauntlets')
      case 2: return t('slotChestplate')
      case 4: return t('slotBoots')
      case 7: return t('slotRing')
      case 8: return t('slotAmulet')
      case 9: return t('slotBanner')
      default: return String(id)
    }
  }, [t])
  // Pre-compute localized slot labels so we can measure their widths once per render.
  const builderRootRef = useRef<HTMLDivElement | null>(null)
  const [cheatSheetMaxHeight, setCheatSheetMaxHeight] = useState<number | null>(null)
  const slotLabels = React.useMemo(
    () => artifactTypeIconList.map(({ id }) => slotLabel(Number(id))),
    [slotLabel]
  )
  // Icon fontSize="small" renders at 20px in our inline SVGs (see artifactTypeIcons).
  const SLOT_ICON_SIZE_PX = 20
  // Measure the longest button label in the current theme to keep slot icons aligned, including the icon/text gap.
  const slotMetrics = React.useMemo(() => {
    const defaultResult = {
      labelWidthPx: 0,
      labelFlexBasis: undefined as string | undefined,
      contentWidthPx: undefined as string | undefined,
      iconGapCss: theme.spacing(0.75),
      iconSizePx: `${SLOT_ICON_SIZE_PX}px`,
    }
    if (!slotLabels.length) return defaultResult
    if (typeof document === 'undefined') return defaultResult
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return defaultResult
    const buttonTypography = theme.typography.button ?? {}
    const fontFamily = buttonTypography.fontFamily ?? theme.typography.fontFamily ?? 'sans-serif'
    const fontStyle = buttonTypography.fontStyle ?? 'normal'
    const fontWeight = `${buttonTypography.fontWeight ?? theme.typography.fontWeightMedium ?? 500}`
    const htmlFontSize = typeof theme.typography.htmlFontSize === 'number'
      ? theme.typography.htmlFontSize
      : Number(theme.typography.htmlFontSize) || 16
    const parentFontSize = typeof theme.typography.fontSize === 'number'
      ? theme.typography.fontSize
      : parseFloat(String(theme.typography.fontSize)) || 14
    const parseSizeToPx = (value: unknown, fallbackPx: number, relativeToPx: number): number => {
      if (typeof value === 'number') return value
      if (value == null) return fallbackPx
      const str = String(value).trim()
      if (!str) return fallbackPx
      if (str.endsWith('rem')) return parseFloat(str) * htmlFontSize
      if (str.endsWith('em')) return parseFloat(str) * relativeToPx
      if (str.endsWith('px')) return parseFloat(str)
      const numeric = parseFloat(str)
      return Number.isNaN(numeric) ? fallbackPx : numeric
    }
    const fontSizePx = parseSizeToPx(buttonTypography.fontSize, parentFontSize, parentFontSize)
    const letterSpacingPx = parseSizeToPx(buttonTypography.letterSpacing, 0, fontSizePx)
    context.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`
    let maxWidth = 0
    for (const label of slotLabels) {
      const measured = context.measureText(label).width
      const spacing = Math.max(label.length - 1, 0) * letterSpacingPx
      const total = measured + spacing
      if (total > maxWidth) maxWidth = total
    }
    const labelWidthPx = Math.ceil(maxWidth + BUILDER_SLOT_LABEL_WIDTH_BUFFER_PX)
    // Account for icon/text gap (theme.spacing uses px units) so icons line up even with padding applied.
    const gapCss = theme.spacing(0.75)
    const gapPx = parseSizeToPx(gapCss, 0, fontSizePx)
    // Icon components render 20px when fontSize="small" (matches artifactTypeIcons sizeFor('small')).
    const contentWidthPx = Math.ceil(labelWidthPx + gapPx + SLOT_ICON_SIZE_PX)
    return {
      labelWidthPx,
      labelFlexBasis: labelWidthPx > 0 ? `${labelWidthPx}px` : undefined,
      contentWidthPx: contentWidthPx > 0 ? `${contentWidthPx}px` : undefined,
      iconGapCss: gapCss,
      iconSizePx: `${SLOT_ICON_SIZE_PX}px`,
    }
  }, [slotLabels, theme])
  useEffect(() => {
    const node = builderRootRef.current
    if (!node) return
    const setHeight = (next: number) => {
      if (!Number.isFinite(next) || next <= 0) return
      setCheatSheetMaxHeight((prev) => (prev === next ? prev : next))
    }
    setHeight(Math.round(node.getBoundingClientRect().height))
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setHeight(Math.round(entry.contentRect.height))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const slotLabelFlexBasis = slotMetrics.labelFlexBasis
  const slotContentWidth = slotMetrics.contentWidthPx
  const slotIconGap = slotMetrics.iconGapCss
  const slotIconSize = slotMetrics.iconSizePx
  const factionLabel = (code: number): string => {
    switch (Number(code)) {
      case Faction.BannerLords: return t('factionBannerLords')
      case Faction.HighElves: return t('factionHighElves')
      case Faction.SacredOrder: return t('factionSacredOrder')
      case Faction.Barbarians: return t('factionBarbarians')
      case Faction.OgrynTribes: return t('factionOgrynTribes')
      case Faction.Lizardmen: return t('factionLizardmen')
      case Faction.Skinwalkers: return t('factionSkinwalkers')
      case Faction.Orcs: return t('factionOrcs')
      case Faction.Demonspawn: return t('factionDemonspawn')
      case Faction.UndeadHordes: return t('factionUndeadHordes')
      case Faction.DarkElves: return t('factionDarkElves')
      case Faction.KnightRevenant: return t('factionKnightRevenant')
      case Faction.Dwarves: return t('factionDwarves')
      case Faction.Shadowkin: return t('factionShadowkin')
      case Faction.SylvanWatchers: return t('factionSylvanWatchers')
      default: return String(code)
    }
  }
  // Subtle pulsing glow animation for the Save button while dirty
  const kfSavePulse = keyframes`
    0% { box-shadow: 0 0 0 1px var(--pulse-inset, rgba(0,0,0,0)) inset, 0 0 6px var(--pulse-outer, rgba(0,0,0,0)); }
    50% { box-shadow: 0 0 0 3px var(--pulse-inset, rgba(0,0,0,0)) inset, 0 0 16px var(--pulse-outer, rgba(0,0,0,0)); }
    100% { box-shadow: 0 0 0 1px var(--pulse-inset, rgba(0,0,0,0)) inset, 0 0 6px var(--pulse-outer, rgba(0,0,0,0)); }
  `
  // Roll indicator sizing and hover gutter come from centralized constants.
  // Toggle button sizing stays centralized so widths remain aligned across builder surfaces.
  const TOGGLE_BUTTON_HEIGHT_PX = BUILDER_TOGGLE_BUTTON_HEIGHT_PX
  const TOGGLE_BUTTON_MIN_WIDTH_PX = BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX
  const TOGGLE_BUTTON_ANY_MIN_WIDTH_PX = BUILDER_TOGGLE_BUTTON_ANY_MIN_WIDTH_PX
  const selectBoxHeightSx = {
    height: TOGGLE_BUTTON_HEIGHT_PX,
    minHeight: TOGGLE_BUTTON_HEIGHT_PX,
  } as const
  const selectContentHeightSx = {
    display: 'flex',
    alignItems: 'center',
    minHeight: 'unset',
    paddingTop: 0,
    paddingBottom: 0,
  } as const
  const update = <K extends keyof BuilderConfig>(k: K, v: BuilderConfig[K]) => onChange({ ...cfg, [k]: v })
  const toggleSubstatFlex = () => {
    if (!canFlexSubstats) return
    onChange({ ...cfg, autoSubstatFlex: !cfg.autoSubstatFlex })
  }
  const [nameDraft, setNameDraft] = useState<string>('')
  const [nameDraftKey, setNameDraftKey] = useState<number | 'builder' | null>(null)
  const currentDraftKey: number | 'builder' = editingIndex ?? 'builder'
  const nameDraftDirty = nameDraftKey === currentDraftKey
  const commitName = React.useCallback((value: string) => {
    const next = value
    const current = cfg.name ?? ''
    if (current === next) {
      setNameDraft('')
      setNameDraftKey(null)
      return next
    }
    onChange({ ...cfg, name: next })
    setNameDraft('')
    setNameDraftKey(null)
    return next
  }, [cfg, onChange])
  const commitNameDraftIfNeeded = React.useCallback(() => {
    if (!nameDraftDirty) return
    commitName(nameDraft)
  }, [commitName, nameDraft, nameDraftDirty])
  const isDirty = selectedIsDirty || nameDraftDirty
  const renderedName = nameDraftDirty ? nameDraft : (cfg.name ?? '')
  const selectedSubs = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
  const lockedSubs = new Set(((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? [])
  const optionalSubs = selectedSubs.filter(v => !lockedSubs.has(v))
  const bounds = (cfg as unknown as { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> }).substatRollBoundsV ?? {}
  const hasWildcardCandidate = optionalSubs.some(v => {
    const b = bounds[Number(v)]
    const hasMin = typeof b?.min === 'number' && b.min > 0
    const hasMax = typeof b?.max === 'number'
    const any = b?.any === true || (!b && true)
    return any && !hasMin && !hasMax
  })
  const effectiveRequired = Math.max(cfg.minCount ?? 0, lockedSubs.size)
  const hasFlexRoom = selectedSubs.length > effectiveRequired
  const canFlexSubstats = !cfg.autoMinCount && hasWildcardCandidate && hasFlexRoom

  useEffect(() => {
    if (!canFlexSubstats && cfg.autoSubstatFlex) {
      onChange({ ...cfg, autoSubstatFlex: false })
    }
  }, [canFlexSubstats, cfg, onChange])
  // Note: We no longer color the stat toggle button borders. The preference
  // now controls coloring of stat texts in chips and preview only.
  const buttonBorderSx = (_variant: number) => {
    return {}
  }
  // Help popover (legacy copy still present); retained to avoid unused code churn.
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null)
  const [helpPos, setHelpPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  useEffect(() => {
    const updateHelpPos = () => {
      try {
        setHelpPos({ top: Math.round(window.innerHeight / 2), left: Math.round(window.innerWidth / 2) })
      } catch {}
    }
    const cleanup = helpAnchor
      ? (() => {
        updateHelpPos()
        window.addEventListener('resize', updateHelpPos)
        return () => window.removeEventListener('resize', updateHelpPos)
      })()
      : undefined
    return cleanup
  }, [helpAnchor])
  // Sets selector ordering/display mode. 'icons' switches the regular Sets list
  // to an icon-only grid; metasets continue to render as a text list.
  const [setsOrder, setSetsOrder] = useState<'game' | 'az' | 'icons'>(() => {
    try {
      const raw = localStorage.getItem(SETS_ORDER_KEY)
      if (raw === 'game' || raw === 'az' || raw === 'icons') return raw
    } catch {}
    return 'icons'
  })
  useEffect(() => {
    try { localStorage.setItem(SETS_ORDER_KEY, setsOrder) } catch {}
  }, [setsOrder])
  const [setsSearch, setSetsSearch] = useState('')
  const { open: metaDlgOpen, openDialog: openMetaDlg, closeDialog: closeMetaDlg } = useMetasetsDialog()
  const [metaSetsMenuOpen, setMetaSetsMenuOpen] = useState(false)
  // Fixed screen anchor for the Sets menu so header position doesn't move when height changes
  const [setsMenuAnchorPos, setSetsMenuAnchorPos] = useState<{ top: number; left: number } | null>(null)
  // While the Sets select menu is open, track which metaset the user is hovering
  // to temporarily highlight member gear sets in the Sets list/grid.
  const [hoveredSetMetaId, setHoveredSetMetaId] = useState<string | null>(null)
  const { open: confirmClearSets, openDialog: openConfirmClearSets, closeDialog: closeConfirmClearSets } = useConfirmDialog()
  
  const [confirmResetBuilder, setConfirmResetBuilder] = useState(false)

  
  const setsLeftRef = useRef<HTMLDivElement | null>(null)
  // Paper element for the Sets select menu; used to measure actual height
  // after mount so we can refine the anchor position precisely.
  const setsMenuPaperRef = useRef<HTMLDivElement | null>(null)
  // Subtle highlight of controls affected by Reset when hovering the button
  const [hoverReset, setHoverReset] = useState(false)
  // Debounced rule count for the current builder config
  const deferredCfg = React.useDeferredValue(cfg)
  const deferredMinima = React.useDeferredValue(minima)
  const latestRuleCountRef = useRef<number | null>(null)
  const computedRuleCount = React.useMemo(() => {
    try {
      const built = buildHsfRules(deferredCfg, deferredMinima)
      const { obsolete } = findObsoleteRules(built)
      const removed = new Set(obsolete.map(o => o.index))
      const count = built.filter((_, i) => !removed.has(i)).length
      latestRuleCountRef.current = count
      return count
    } catch (_e) {
      latestRuleCountRef.current = null
      return null
    }
  }, [deferredCfg, deferredMinima])
  const counting = deferredCfg !== cfg || deferredMinima !== minima
  const ruleCount = counting ? latestRuleCountRef.current : computedRuleCount
  // setsLeftRef is used to align the Sets search row menu. No width measuring needed here.

  // Config name is edited directly on the builder state; no local draft needed.
  // Whether the current builder matches the built-in defaults.
  // Keep this aligned with the Reset-to-defaults payload below.
  const [defaultsEpoch, setDefaultsEpoch] = useState(0)
  const isDefaultBuilder = React.useMemo(() => {
    void defaultsEpoch // intentionally depend on defaultsEpoch to recompute when user defaults change
    const factoryDefaults = (): BuilderConfig => ({
      name: '',
      keep: true,
      rankCode: 0,
      rarityCode: 0,
      rarityMode: 'auto',
      autoRaritySupplementsThreshold: 'rare',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0,
      maxLevel: 16,
      rollMode: 'auto',
      rollBaseline: 'afterStart',
      earlyKeepMode: 'early',
      substatsV: [],
      fixedSubstatsV: [],
      minCount: 0,
      autoMinCount: true,
      autoSubstatFlex: false,
      minRequiredRolls: 0,
      autoMinRequiredRolls: true,
      substatRollBoundsV: {},
      artifactTypes: [],
      artifactSets: [],
      artifactMetaSets: [],
      substatMinTarget: 'selected',
    })
    const loadUserDefaults = (): BuilderConfig | null => {
      try {
        const raw = localStorage.getItem(BUILDER_USER_DEFAULTS_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        return parsed as BuilderConfig
      } catch { return null }
    }
    const target = loadUserDefaults() ?? factoryDefaults()
    const asNumArr = (v: unknown): number[] => Array.isArray(v) ? (v as number[]) : []
    const empty = (v: unknown) => {
      if (Array.isArray(v)) return v.length === 0
      if (v && typeof v === 'object') return Object.keys(v as object).length === 0
      return !v
    }
    const substatMinTarget = (cfg as unknown as { substatMinTarget?: 'locked'|'selected' }).substatMinTarget ?? 'selected'
    return (
      (cfg.name ?? '') === (target.name ?? '') &&
      cfg.keep === Boolean(target.keep) &&
      Number(cfg.rankCode) === Number(target.rankCode) &&
      Number((cfg as unknown as { rarityCode?: number }).rarityCode ?? 0) === Number((target as unknown as { rarityCode?: number }).rarityCode ?? 0) &&
      (((cfg as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode ?? 'auto') === ((target as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode ?? 'auto')) &&
      (((cfg as unknown as { autoRaritySupplementsThreshold?: 'uncommon'|'rare'|'epic' }).autoRaritySupplementsThreshold ?? 'rare') === ((target as unknown as { autoRaritySupplementsThreshold?: 'uncommon'|'rare'|'epic' }).autoRaritySupplementsThreshold ?? 'rare')) &&
      Number((cfg as unknown as { factionCode?: number }).factionCode ?? 0) === Number((target as unknown as { factionCode?: number }).factionCode ?? 0) &&
      JSON.stringify(asNumArr((cfg as unknown as { mainStatsV?: number[] }).mainStatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { mainStatsV?: number[] }).mainStatsV).slice().sort()) &&
      (cfg as unknown as { minLevel?: 0|4|8|12|16 }).minLevel === (target as unknown as { minLevel?: 0|4|8|12|16 }).minLevel &&
      (cfg as unknown as { maxLevel?: 0|4|8|12|16 }).maxLevel === (target as unknown as { maxLevel?: 0|4|8|12|16 }).maxLevel &&
      ((cfg as unknown as { earlyKeepMode?: 'early'|'late' }).earlyKeepMode ?? 'early') === ((target as unknown as { earlyKeepMode?: 'early'|'late' }).earlyKeepMode ?? 'early') &&
      ((cfg as unknown as { rollBaseline?: 'afterStart'|'upToLevel' }).rollBaseline ?? 'afterStart') === ((target as unknown as { rollBaseline?: 'afterStart'|'upToLevel' }).rollBaseline ?? 'afterStart') &&
      ((cfg as unknown as { rollMode?: 'strict'|'potential'|'auto' }).rollMode ?? 'auto') === ((target as unknown as { rollMode?: 'strict'|'potential'|'auto' }).rollMode ?? 'auto') &&
      JSON.stringify(asNumArr((cfg as unknown as { substatsV?: number[] }).substatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { substatsV?: number[] }).substatsV).slice().sort()) &&
      JSON.stringify(asNumArr((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV).slice().sort()) &&
      Number(cfg.minCount) === Number(target.minCount) &&
      Boolean(cfg.autoMinCount) === Boolean(target.autoMinCount) &&
      Boolean((cfg as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false) === Boolean((target as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false) &&
      Number((cfg as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) === Number((target as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) &&
      Boolean((cfg as unknown as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true) === Boolean((target as unknown as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true) &&
      empty((cfg as unknown as { substatRollBoundsV?: Record<number, unknown> }).substatRollBoundsV ?? {}) === empty((target as unknown as { substatRollBoundsV?: Record<number, unknown> }).substatRollBoundsV ?? {}) &&
      JSON.stringify(asNumArr((cfg as unknown as { artifactTypes?: number[] }).artifactTypes).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { artifactTypes?: number[] }).artifactTypes).slice().sort()) &&
      JSON.stringify(asNumArr((cfg as unknown as { artifactSets?: number[] }).artifactSets).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { artifactSets?: number[] }).artifactSets).slice().sort()) &&
      JSON.stringify(((cfg as unknown as { artifactMetaSets?: string[] }).artifactMetaSets ?? []).slice().sort()) === JSON.stringify(((target as unknown as { artifactMetaSets?: string[] }).artifactMetaSets ?? []).slice().sort()) &&
      substatMinTarget === ((target as unknown as { substatMinTarget?: 'locked'|'selected' }).substatMinTarget ?? 'selected')
    )
  }, [cfg, defaultsEpoch])

  // Compute the effective defaults (user overrides if present; otherwise factory)
  const getEffectiveDefaults = React.useCallback((): BuilderConfig => {
    try {
      const raw = localStorage.getItem(BUILDER_USER_DEFAULTS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as BuilderConfig
        if (parsed && typeof parsed === 'object') return parsed
      }
    } catch {}
    return {
      name: '', keep: true, rankCode: 0, rarityCode: 0, rarityMode: 'auto', autoRaritySupplementsThreshold: 'rare', factionCode: 0,
      mainStatsV: [], minLevel: 0, maxLevel: 16, rollMode: 'auto', rollBaseline: 'afterStart', earlyKeepMode: 'early',
      substatsV: [], fixedSubstatsV: [], minCount: 0, autoMinCount: true, minRequiredRolls: 0, autoMinRequiredRolls: true,
      autoSubstatFlex: false,
      substatRollBoundsV: {}, artifactTypes: [], artifactSets: [], artifactMetaSets: [], substatMinTarget: 'selected',
    }
  }, [])

  // Context menu for Reset to defaults
  const [resetMenuAnchor, setResetMenuAnchor] = useState<HTMLElement | null>(null)
  // Persisted toggle: auto reset the builder after inserting a config
  const [autoResetAfterInsert, setAutoResetAfterInsert] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(BUILDER_AUTO_RESET_AFTER_INSERT_KEY)
      return raw === 'true' || raw === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try { localStorage.setItem(BUILDER_AUTO_RESET_AFTER_INSERT_KEY, String(autoResetAfterInsert)) } catch {}
  }, [autoResetAfterInsert])

  // Wrap insert to optionally reset builder controls to defaults (no dialog)
  const handleAddToCustom = () => {
    commitNameDraftIfNeeded()
    onAddToCustom()
    if (autoResetAfterInsert) {
      const eff = getEffectiveDefaults()
      onChange({ ...cfg, ...eff })
    }
  }
  // Attention phase: After idle threshold while dirty, replay suite effects every interval.
  const [attentionState, setAttentionState] = useState<{ phase: boolean; burst: boolean }>({ phase: false, burst: false })
  const attentionPhase = attentionState.phase
  const attentionBurst = attentionState.burst
  const [interactionNonce, setInteractionNonce] = useState(0)
  // Arm idle timer when dirty and reset whenever builder changes or user interacts
  useEffect(() => {
    setAttentionState({ phase: false, burst: false })
    const idle = isDirty
      ? window.setTimeout(() => setAttentionState({ phase: true, burst: true }), BUILDER_DIRTY_NUDGE_IDLE_MS)
      : null
    return () => { idle !== null && window.clearTimeout(idle) }
  }, [cfg, interactionNonce, isDirty])
  // When phase starts, trigger immediate burst and then repeat every interval until cancelled
  useEffect(() => {
    const activate = () => {
      setAttentionState(prev => ({ ...prev, burst: true }))
      const clearBurst = window.setTimeout(() => setAttentionState(prev => ({ ...prev, burst: false })), 1300)
      const iv = window.setInterval(() => {
        setAttentionState(prev => ({ ...prev, burst: true }))
        window.setTimeout(() => setAttentionState(prev => ({ ...prev, burst: false })), 1300)
      }, BUILDER_DIRTY_ATTENTION_INTERVAL_MS)
      return () => { window.clearTimeout(clearBurst); window.clearInterval(iv) }
    }
    return attentionPhase ? activate() : undefined
  }, [attentionPhase])
  // Suite style only when we are in a burst window
  const suiteSx = useAttentionEffectStyles(attentionBurst)

  // Legendary 42 overlay (centralized in attentionEffects)
  const fortyTwoOverlay = useFortyTwoLegendaryOverlay((Number(cfg.minCount) === 4) && (Number((cfg as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) === 2))

  return (
    <Box ref={builderRootRef} sx={{ position: 'relative' }}>
      {fortyTwoOverlay}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
        columnGap: 1,
        rowGap: 2,
      }}>
        <Box sx={(theme) => ({
          gridColumn: '1 / -1',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <TextField
            label={t('builderConfigName')}
            value={renderedName}
            onChange={(e) => {
              setNameDraft(e.target.value)
              setNameDraftKey(currentDraftKey)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
            onBlur={commitNameDraftIfNeeded}
            InputProps={{
              endAdornment: renderedName ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label={t('builderClearConfigName')}
                    onClick={() => { if (renderedName !== '') commitName('') }}
                    edge="end"
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
            fullWidth
            inputProps={{ 'data-tour-id': 'builder.name' }}
          />
        </Box>

        <FormControl sx={(theme) => ({
          gridColumn: '1 / -1',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip title={<BuilderTooltipContent text={t('builderActionHelp')} />}>
              <span>{t('builderAction')}</span>
            </Tooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.keep ? 'keep' : 'sell'}
              onChange={(_, v) => v && update('keep', v === 'keep')}
              sx={{ height: 40 }}
              data-tour-id="builder.action"
            >
            <ToggleButton
              value="keep"
              sx={cfg.keep ? {
                borderColor: 'success.main',
                color: 'success.main',
                '&.Mui-selected': {
                  bgcolor: 'success.main',
                  color: '#fff',
                  '&:hover': { bgcolor: 'success.dark' },
                },
              } : {}}
            >
              {t('keepValueKeep')}
            </ToggleButton>
            <ToggleButton
              value="sell"
              sx={!cfg.keep ? {
                borderColor: 'error.main',
                color: 'error.main',
                '&.Mui-selected': {
                  bgcolor: 'error.main',
                  color: '#fff',
                  '&:hover': { bgcolor: 'error.dark' },
                },
              } : {}}
            >
              {t('keepValueSell')}
            </ToggleButton>
            </ToggleButtonGroup>
            {(() => {
              const isEnabled = cfg.enabled !== false
              return (
                <Tooltip title={isEnabled ? t('builderEnabledInExport') : t('builderDisabledInExport')}>
                  <Button
                    size="small"
                    variant={isEnabled ? 'contained' : 'outlined'}
                    color={isEnabled ? 'success' : 'warning'}
                    sx={{ minWidth: 160, ml: 1 }}
                    startIcon={isEnabled ? <VisibilityIcon /> : <VisibilityOffIcon />}
                    onClick={() => update('enabled', !isEnabled)}
                    data-tour-id="builder.enabled"
            >
              {isEnabled ? t('builderEnabledInSellfile') : t('builderDisabledInSellfile')}
            </Button>
                </Tooltip>
              )
            })()}
            <Box sx={{ ml: 'auto' }}>
              <Tooltip title={t('builderHelpOpen')}>
                <IconButton
                  size="medium"
                  color="primary"
                  onClick={(e) => setHelpAnchor(e.currentTarget as HTMLElement)}
                  aria-label={t('builderHelpOpen')}
                >
                  <HelpOutlineIcon fontSize="medium" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </FormControl>

        {/* Row 2: Left half (Rank, Rarity, Faction) */}
        <Box sx={(theme) => ({
          gridColumn: '1 / 3',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))',
          columnGap: 1,
          rowGap: 2,
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
        <FormControl fullWidth sx={{ position: 'relative' }}>
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip title={<BuilderTooltipContent text={t('builderRankHelp')} />}>
              <span>{t('builderRank')}</span>
            </Tooltip>
          </FormLabel>
          <Select
            size="small"
            value={String(cfg.rankCode)}
            onChange={(e: SelectChangeEvent<string>) => update('rankCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
            data-tour-id="builder.rank"
            sx={{
              ...selectBoxHeightSx,
              '& .MuiSelect-select': selectContentHeightSx,
            }}
          >
            <MenuItem value={String(0)}>{t('any')}</MenuItem>
            <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityExact')}</ListSubheader>
            {[RankCode.One,RankCode.Two,RankCode.Three,RankCode.Four,RankCode.Five,RankCode.Six].map((code) => (
              <MenuItem key={code} value={String(code)}>{rankOptionLabel(Number(code))}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityGte')}</ListSubheader>
            {[RankCode.GTE_One,RankCode.GTE_Two,RankCode.GTE_Three,RankCode.GTE_Four,RankCode.GTE_Five].map((code) => (
              <MenuItem key={code} value={String(code)}>{rankOptionLabel(Number(code))}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityLte')}</ListSubheader>
            {[RankCode.LTE_Two,RankCode.LTE_Three,RankCode.LTE_Four,RankCode.LTE_Five,RankCode.LTE_Six].map((code) => (
              <MenuItem key={code} value={String(code)}>{rankOptionLabel(Number(code))}</MenuItem>
            ))}
          </Select>
          
        </FormControl>

        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Tooltip
              title={(
                <BuilderTooltipContent
                  text={[
                    t('builderRarityHelpIntro'),
                    `• ${t('builderRarityHelpNoMinRolls')}`,
                    `• ${t('builderRarityHelpStartSubs')}`,
                    `• ${t('builderRarityHelpMinTotalRolls')}`,
                    `• ${t('builderAutoPlusLateHelp')}`,
                  ].join('\n')}
                />
              )}
            >
              <span>{t('filterRarity')}</span>
            </Tooltip>
            <Tooltip
              title={(
                <BuilderTooltipContent
                  text={[
                    t('builderAutoLateTitle'),
                    `• ${t('builderAutoLateIntro')}`,
                    `• ${t('builderAutoGeExample', { tier: t('rarityRare') })}`,
                    `• ${t('builderAutoLateL4', { rare: t('rarityRare'), uncommon: t('rarityUncommon') })}`,
                    `• ${t('builderAutoLateL8', { epic: t('rarityEpic') })}`,
                    `• ${t('builderAutoLateL12', { legendary: t('rarityLegendary') })}`,
                    `• ${t('builderAutoLateDisabledNote')}`,
                  ].join('\n')}
                />
              )}
            >
              <span>
                {(() => {
                  const chipEnabled = (cfg.rarityMode === 'auto') && (cfg.earlyKeepMode === 'late') && isMilestoneThresholdsActive(cfg)
                  const labelValue = chipEnabled
                    ? ((cfg.autoRaritySupplementsThreshold ?? 'rare') === 'uncommon' ? 'Uncommon' : (cfg.autoRaritySupplementsThreshold ?? 'rare') === 'epic' ? 'Epic' : 'Rare')
                    : ''
                  return (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={chipEnabled ? t('builderAutoGeLabel', { tier: labelValue }) : t('builderAutoPlusLate')}
                      disabled={!chipEnabled}
                      onClick={() => {
                        if (!chipEnabled) return
                        const curr = (cfg.autoRaritySupplementsThreshold ?? 'rare')
                        const next = (curr === 'uncommon') ? 'rare' : (curr === 'rare' ? 'epic' : 'uncommon')
                        onChange({ ...cfg, autoRaritySupplementsThreshold: next })
                      }}
                      sx={chipEnabled ? {} : {
                        position: 'relative',
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          left: 6,
                          right: 6,
                          top: '50%',
                          height: 0,
                          borderTop: '2px solid currentColor',
                          transform: 'translateY(-50%) rotate(-8deg)',
                          opacity: 0.6,
                          pointerEvents: 'none',
                        },
                      }}
                    />
                  )
                })()}
              </span>
            </Tooltip>
          </FormLabel>
          <Select
            size="small"
            value={cfg.rarityMode === 'auto' ? 'auto' : String(cfg.rarityCode)}
            onChange={(e: SelectChangeEvent<string>) => {
              const v = e.target.value
              if (v === 'auto') {
                onChange({ ...cfg, rarityMode: 'auto' })
              } else {
                onChange({ ...cfg, rarityMode: 'code', rarityCode: Number(v) })
              }
            }}
            MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
            data-tour-id="builder.rarity"
            sx={{
              ...selectBoxHeightSx,
              '& .MuiSelect-select': selectContentHeightSx,
            }}
          >
            <MenuItem value={'auto'}>{t('headerMenuAuto')}</MenuItem>
            <MenuItem value={String(0)}>{rarityCodeToName(0) || t('any')}</MenuItem>
            <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityExact')}</ListSubheader>
            {[RarityCode.Common,RarityCode.Uncommon,RarityCode.Rare,RarityCode.Epic,RarityCode.Legendary,RarityCode.Mythical].map((code) => (
              <MenuItem key={code} value={String(code)}>{
                code === RarityCode.Common ? t('rarityCommon') :
                code === RarityCode.Uncommon ? t('rarityUncommon') :
                code === RarityCode.Rare ? t('rarityRare') :
                code === RarityCode.Epic ? t('rarityEpic') :
                code === RarityCode.Legendary ? t('rarityLegendary') :
                code === RarityCode.Mythical ? t('rarityMythical') : rarityCodeToName(code)
              }</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityGte')}</ListSubheader>
            {[RarityCode.GTE_Common,RarityCode.GTE_Uncommon,RarityCode.GTE_Rare,RarityCode.GTE_Epic,RarityCode.GTE_Legendary].map((code) => (
              <MenuItem key={code} value={String(code)}>{
                code === RarityCode.GTE_Common ? `≥${NBSP}${t('rarityCommon')}` :
                code === RarityCode.GTE_Uncommon ? `≥${NBSP}${t('rarityUncommon')}` :
                code === RarityCode.GTE_Rare ? `≥${NBSP}${t('rarityRare')}` :
                code === RarityCode.GTE_Epic ? `≥${NBSP}${t('rarityEpic')}` :
                code === RarityCode.GTE_Legendary ? `≥${NBSP}${t('rarityLegendary')}` : rarityCodeToName(code)
              }</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityLte')}</ListSubheader>
            {[RarityCode.LTE_Uncommon,RarityCode.LTE_Rare,RarityCode.LTE_Epic,RarityCode.LTE_Legendary,RarityCode.LTE_Mythical].map((code) => (
              <MenuItem key={code} value={String(code)}>{
                code === RarityCode.LTE_Uncommon ? `≤${NBSP}${t('rarityUncommon')}` :
                code === RarityCode.LTE_Rare ? `≤${NBSP}${t('rarityRare')}` :
                code === RarityCode.LTE_Epic ? `≤${NBSP}${t('rarityEpic')}` :
                code === RarityCode.LTE_Legendary ? `≤${NBSP}${t('rarityLegendary')}` :
                code === RarityCode.LTE_Mythical ? `≤${NBSP}${t('rarityMythical')}` : rarityCodeToName(code)
              }</MenuItem>
            ))}
          </Select>
          {/* Chip is inline with label; no absolutely positioned overlay. */}
          
        </FormControl>

        {/* Faction selection (accessories only) */}
        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip title={<BuilderTooltipContent text={t('builderFactionHelp')} />}>
              <span>{t('builderFaction')}</span>
            </Tooltip>
          </FormLabel>
          <Select
            size="small"
            value={String(cfg.factionCode ?? 0)}
            onChange={(e: SelectChangeEvent<string>) => update('factionCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
            data-tour-id="builder.faction"
            sx={{
              ...selectBoxHeightSx,
              '& .MuiSelect-select': selectContentHeightSx,
            }}
          >
            <MenuItem value={String(0)}>{t('any')}</MenuItem>
            <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupTelerianLeague')}</ListSubheader>
            {[Faction.BannerLords,Faction.HighElves,Faction.SacredOrder,Faction.Barbarians].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionLabel(Number(code))}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupGaellenPact')}</ListSubheader>
            {[Faction.OgrynTribes,Faction.Lizardmen,Faction.Skinwalkers,Faction.Orcs].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionLabel(Number(code))}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupTheCorrupted')}</ListSubheader>
            {[Faction.Demonspawn,Faction.UndeadHordes,Faction.DarkElves,Faction.KnightRevenant].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionLabel(Number(code))}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupNyresanUnion')}</ListSubheader>
            {[Faction.Dwarves,Faction.Shadowkin,Faction.SylvanWatchers].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionLabel(Number(code))}</MenuItem>
            ))}
          </Select>
        </FormControl>
        </Box>
        {/* Row 2: Right half (Count Rolls, Evaluate From, Roll Strategy) */}
        <Box sx={(theme) => ({
          gridColumn: '3 / 5',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
        <FormControl>
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip title={<BuilderTooltipContent text={t('builderMinLevelHelp')} />}>
              <span>{t('builderMinLevel')}</span>
            </Tooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={String((cfg as BuilderConfig).minLevel ?? 0)}
              onChange={(_, v) => {
                if (!v) return
                const num = Number(v)
                if ([0,4,8,12,16].includes(num)) {
                  const currentMax = ((cfg as BuilderConfig).maxLevel ?? 16) as 0|4|8|12|16
                  const nextMin = num as 0|4|8|12|16
                  const nextMax = (nextMin > currentMax ? nextMin : currentMax) as 0|4|8|12|16
                  onChange({ ...cfg, minLevel: nextMin, maxLevel: nextMax })
                }
              }}
              sx={{
                height: TOGGLE_BUTTON_HEIGHT_PX,
                '& .MuiToggleButton-root': {
                  height: TOGGLE_BUTTON_HEIGHT_PX,
                },
              }}
            >
              {LEVELS.map((l) => (
                <ToggleButton key={l} value={String(l)}>+{l}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </FormControl>

        <FormControl>
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip title={<BuilderTooltipContent text={t('builderMaxLevelHelp')} />}>
              <span>{t('builderMaxLevel')}</span>
            </Tooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={String((cfg as BuilderConfig).maxLevel ?? 16)}
              onChange={(_, v) => {
                if (!v) return
                const num = Number(v)
                if ([0,4,8,12,16].includes(num)) {
                  const currentMin = ((cfg as BuilderConfig).minLevel ?? 0) as 0|4|8|12|16
                  const nextMax = num as 0|4|8|12|16
                  const nextMin = (nextMax < currentMin ? nextMax : currentMin) as 0|4|8|12|16
                  onChange({ ...cfg, minLevel: nextMin, maxLevel: nextMax })
                }
              }}
              sx={{
                height: TOGGLE_BUTTON_HEIGHT_PX,
                '& .MuiToggleButton-root': {
                  height: TOGGLE_BUTTON_HEIGHT_PX,
                },
              }}
            >
              {LEVELS.map((l) => (
                <ToggleButton key={l} value={String(l)}>+{l}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </FormControl>
        {/* Roll Strategy removed — level window controls replace it. */}
        
        </Box>
        {/* Help popover */}
        <BuilderCheatSheetPopover
          open={Boolean(helpAnchor)}
          anchorPosition={helpAnchor ? helpPos : undefined}
          maxHeight={cheatSheetMaxHeight ?? null}
          onClose={() => setHelpAnchor(null)}
          substatColors={substatColors}
        />
        {/* Row 3: Mainstat (left), Substats (right) */}
        <FormControl sx={(theme) => ({
          gridColumn: '1 / 3',
          borderRadius: 1,
          // Align hover timing with other groups for Reset hover tint
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip title={<BuilderTooltipContent text={t('builderMainHelp')} />}>
              <span>{t('builderMain')}</span>
            </Tooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              const value: string[] = (() => {
                const v = (cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []
                return v.length > 0 ? v.map(String) : ['any']
              })()
              const handleChange = (_: React.SyntheticEvent, v: string[]) => {
                if (!Array.isArray(v)) return
                const prevHadAny = (((cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []).length === 0)
                const hasAny = v.includes('any')
                const others = v.filter(x => x !== 'any')

                if (others.length === 0) {
                  // Any
                  onChange({ ...cfg, mainStatsV: [] })
                  return
                }

                if (hasAny) {
                  if (prevHadAny) {
                    const nextV = others.map(token => Number(token)).filter((n) => Number.isFinite(n))
                    onChange({ ...cfg, mainStatsV: nextV as number[] })
                  } else {
                    onChange({ ...cfg, mainStatsV: [] })
                  }
                  return
                }

                const nextV = others.map(token => Number(token)).filter((n) => Number.isFinite(n))
                onChange({ ...cfg, mainStatsV: nextV as number[] })
              }
              return (
                <>
                  {/* Row 1: Any */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: TOGGLE_BUTTON_ANY_MIN_WIDTH_PX, height: TOGGLE_BUTTON_HEIGHT_PX } }} data-tour-id="builder.mainstat">
                    <ToggleButton value="any">{t('any')}</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={handleChange}
                    sx={{
                      gap: 0.5,
                      '& .MuiToggleButton-root': { px: 0.75, minWidth: TOGGLE_BUTTON_MIN_WIDTH_PX, width: TOGGLE_BUTTON_MIN_WIDTH_PX, height: TOGGLE_BUTTON_HEIGHT_PX, justifyContent: 'center' },
                      // Remove MUI's grouped negative margin to prevent 1px shifting on selection
                      '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                        marginLeft: '0 !important',
                        borderLeft: '1px solid transparent',
                      },
                      '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': {
                        marginLeft: '0 !important',
                        borderLeft: '1px solid transparent',
                      },
                    }}
                  >
                    <ToggleButton value={`${StatVariant.HP_FLAT}`} sx={buttonBorderSx(StatVariant.HP_FLAT)}>{t(statVariantI18nKey(StatVariant.HP_FLAT))}</ToggleButton>
                    <ToggleButton value={`${StatVariant.HP}`} sx={buttonBorderSx(StatVariant.HP)}>{t(statVariantI18nKey(StatVariant.HP))}</ToggleButton>
                    <ToggleButton value={`${StatVariant.ATK_FLAT}`} sx={buttonBorderSx(StatVariant.ATK_FLAT)}>{t(statVariantI18nKey(StatVariant.ATK_FLAT))}</ToggleButton>
                    <ToggleButton value={`${StatVariant.ATK}`} sx={buttonBorderSx(StatVariant.ATK)}>{t(statVariantI18nKey(StatVariant.ATK))}</ToggleButton>
                    <ToggleButton value={`${StatVariant.DEF_FLAT}`} sx={buttonBorderSx(StatVariant.DEF_FLAT)}>{t(statVariantI18nKey(StatVariant.DEF_FLAT))}</ToggleButton>
                    <ToggleButton value={`${StatVariant.DEF}`} sx={buttonBorderSx(StatVariant.DEF)}>{t(statVariantI18nKey(StatVariant.DEF))}</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={handleChange}
                    sx={{
                      gap: 0.5,
                      '& .MuiToggleButton-root': { px: .75, minWidth: TOGGLE_BUTTON_MIN_WIDTH_PX, width: TOGGLE_BUTTON_MIN_WIDTH_PX, height: TOGGLE_BUTTON_HEIGHT_PX, justifyContent: 'center' },
                      '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                        marginLeft: '0 !important',
                        borderLeft: '1px solid transparent',
                      },
                      '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': {
                        marginLeft: '0 !important',
                        borderLeft: '1px solid transparent',
                      },
                    }}
                  >
                    <ToggleButton value={`${StatVariant.SPD}`} sx={buttonBorderSx(StatVariant.SPD)} data-tour-id="builder.mainstat.spd">{t(statVariantI18nKey(StatVariant.SPD))}</ToggleButton>
                    <ToggleButton value={`${StatVariant.RES}`} sx={buttonBorderSx(StatVariant.RES)}>{t(statVariantI18nKey(StatVariant.RES))}</ToggleButton>
                    <ToggleButton value={`${StatVariant.ACC}`} sx={buttonBorderSx(StatVariant.ACC)}>{t(statVariantI18nKey(StatVariant.ACC))}</ToggleButton>
                    <ToggleButton value={`${StatVariant.CR}`} sx={buttonBorderSx(StatVariant.CR)}>{t(statVariantI18nKey(StatVariant.CR))}</ToggleButton>
                    <ToggleButton value={`${StatVariant.CDMG}`} sx={buttonBorderSx(StatVariant.CDMG)}>{t(statVariantI18nKey(StatVariant.CDMG))}</ToggleButton>
                  </ToggleButtonGroup>
                </>
              )
            })()}
          </Box>
        </FormControl>

        <FormControl sx={(theme) => ({
          gridColumn: '3 / 5',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })} data-tour-id="builder.substats">
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip
              title={(
                <BuilderTooltipContent
                  text={[
                    t('builderSubstatsPickHelp'),
                    `• ${t('builderSubstatsClickHint')}`,
                    `• ${t('rollIndicatorTip1')}`,
                    `• ${t('rollIndicatorTip2')}`,
                    `• ${t('rollIndicatorTip3')}`,
                    `• ${t('rollIndicatorTip4')}`,
                  ].join('\n')}
                />
              )}
            >
              <span>{t('builderSubstats')}</span>
            </Tooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              
              const value: string[] = (() => {
                const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                if (subsV.length === 0) return ['any']
                return (subsV as number[]).map(String)
              })()
              const isSelected = (v: number) => {
                const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                return subsV.includes(v)
              }
              const isFixed = (v: number) => {
                const fixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
                return fixedV.includes(v)
              }
              const getBounds = (vKey: number) => {
                return (cfg.substatRollBoundsV)?.[vKey]
              }
              const setBounds = (vKey: number, bounds?: { min?: number; max?: number; any?: boolean }) => {
                const prevVariant = (cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
                const isEmpty = !bounds || (bounds.min === undefined && bounds.max === undefined && !('any' in bounds && bounds.any))
                let nextVariant: Record<number, { min?: number; max?: number; any?: boolean }> | undefined
                if (isEmpty) {
                  const { [vKey]: _omitV, ...restV } = prevVariant
                  nextVariant = Object.keys(restV).length ? restV : undefined
                } else {
                  nextVariant = { ...prevVariant, [vKey]: bounds }
                }
                // If Milestone Thresholds become inactive (no per‑stat mins and no global min),
                // normalize keep mode to Early so re‑enabling starts at Early.
                const nextCfg = {
                  ...cfg,
                  ...(nextVariant ? { substatRollBoundsV: nextVariant } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }),
                }
                onChange(normalizeKeepMode(nextCfg))
              }
              // No unset: default is star (any).
              // New interaction model:
              // - Left click increases current sequence.
              //   From ★: enters Min (0), then 1→…→5→★.
              //   From Roll cap: 0→…→4→★.
              // - Right click decreases current sequence.
              //   From ★: enters Roll cap (4), then 3→…→0→★.
              const cycleMin = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const curMin = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                if (isAny) {
                  // ★ -> 0 (Min)
                  setBounds(vKey, { min: 0 })
                } else if (hasMin && curMin < 5) {
                  // 1..4 -> +1; 5 handled below
                  setBounds(vKey, { min: curMin + 1 })
                } else {
                  // none or 5 -> ★
                  setBounds(vKey, { any: true })
                }
              }

              const cycleForward = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any) || (!b || (b.min === undefined && b.max === undefined))
                const hasMax = typeof b?.max === 'number'
                const hasMin = typeof b?.min === 'number'
                if (isAny) {
                  // ★ -> Min 0
                  setBounds(vKey, { min: 0 })
                } else if (hasMax) {
                  // Left-click on Roll Cap goes down (1→0→★)
                  cycleMaxBack(vKey)
                } else if (hasMin) {
                  cycleMin(vKey)
                } else {
                  setBounds(vKey, { any: true })
                }
              }

              const cycleBackward = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any) || (!b || (b.min === undefined && b.max === undefined))
                const hasMax = typeof b?.max === 'number'
                const hasMin = typeof b?.min === 'number'
                if (isAny) {
                  // ★ -> Roll cap 0 (forbid rolls)
                  setBounds(vKey, { max: 0 })
                } else if (hasMax) {
                  // On Roll Cap, right‑click increases (0→1→…→4→★)
                  const curMax = Math.max(0, Math.min(4, Number(b?.max)))
                  if (curMax < 4) setBounds(vKey, { max: curMax + 1 })
                  else setBounds(vKey, { any: true })
                } else if (hasMin) {
                  cycleMinBack(vKey)
                } else {
                  setBounds(vKey, { any: true })
                }
              }

              const cycleMinBack = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const curMin = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                if (isAny) {
                  // ★ -> 5 (Min)
                  setBounds(vKey, { min: 5 })
                } else if (hasMin && curMin > 0) {
                  // 1..5 -> -1; 0 handled below
                  setBounds(vKey, { min: curMin - 1 })
                } else {
                  // 0 or none -> ★
                  setBounds(vKey, { any: true })
                }
              }
              
              const cycleMaxBack = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMax = typeof b?.max === 'number'
                const curMax = hasMax ? Math.max(0, Math.min(4, Number(b?.max))) : 0
                if (isAny) {
                  // ★ -> 4 (Max)
                  setBounds(vKey, { max: 4 })
                } else if (hasMax && curMax > 0) {
                  // 1..4 -> -1; 0 handled below
                  setBounds(vKey, { max: curMax - 1 })
                } else {
                  // 0 or none -> ★
                  setBounds(vKey, { any: true })
                }
              }
              
              const cycleSubstat = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                
                const selected = isSelected(vKey)
                const fixed = isFixed(vKey)
                if (!selected) {
                  const prevV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                  const nextV = [...prevV, vKey]
                  const nextLen = nextV.length
                  const nextMin = (cfg.autoMinCount ? Math.min(4, nextLen) : ((cfg.minCount === 0 && nextLen > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                  const bVAll = { ...((cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>) }
                  bVAll[vKey] = { any: true }
                  onChange({ ...cfg, substatsV: nextV, minCount: nextMin, substatRollBoundsV: bVAll })
                  return
                }
                if (selected && !fixed) {
                  const prevFixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
                  const nextFixedV2 = [...prevFixedV, vKey]
                  onChange({ ...cfg, fixedSubstatsV: nextFixedV2 })
                  return
                }
                // was fixed -> remove entirely
                const prevSubsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                const nextSubsV = prevSubsV.filter((v) => v !== vKey)
                const prevFixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
                const nextFixedV = prevFixedV.filter((v) => v !== vKey)
                // prune bounds for substat (variant-keyed)
                const bVAll = { ...((cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>) }
                const { [vKey]: _omit, ...restV } = bVAll
                const prunedV: Record<number, {min?:number; max?:number; any?:boolean}> = restV
                const nextMin = (cfg.autoMinCount ? Math.min(4, nextSubsV.length) : (cfg.minCount > nextSubsV.length ? (nextSubsV.length as 0|1|2|3|4) : cfg.minCount)) as 0|1|2|3|4
                // Check if this removal deactivates Milestone Thresholds; if so, normalize to Early.
                onChange(normalizeKeepMode({ ...cfg, substatsV: nextSubsV, fixedSubstatsV: nextFixedV, substatRollBoundsV: prunedV, minCount: nextMin }))
              }
              const handleChange = (_: React.SyntheticEvent, v: string[]) => {
                if (!Array.isArray(v)) return
                const prevSubsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                const prevHadAny = (prevSubsV.length === 0)
                const hasAny = v.includes('any')
                const others = v.filter(x => x !== 'any')

                if (others.length === 0) {
                  // No specific substats selected -> Any
                  onChange(normalizeKeepMode({ ...cfg, substatsV: [], fixedSubstatsV: [], minCount: 0, substatRollBoundsV: {} }))
                  return
                }

                if (hasAny) {
                  if (prevHadAny) {
                    // Transition from Any -> specifics: drop Any, keep specifics
                    const next = others.map(token => Number(token))
                    const nextBoundsV = (() => {
                      const bV = (cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>
                      const keepVarKeys = new Set(next)
                      const outV: Record<number, {min?:number;max?:number;any?:boolean}> = {}
                      for (const [k,v] of Object.entries(bV)) { const nk = Number(k); if (keepVarKeys.has(nk)) outV[nk] = v as { min?: number; max?: number; any?: boolean } }
                      return Object.keys(outV).length ? outV : undefined
                    })()
                    const nextMin = (cfg.autoMinCount ? Math.min(4, next.length) : ((cfg.minCount === 0 && next.length > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                    onChange(normalizeKeepMode({ ...cfg, substatsV: next, fixedSubstatsV: ((((cfg as unknown) as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []).filter((v: number) => next.includes(v)), minCount: nextMin, ...(nextBoundsV ? { substatRollBoundsV: nextBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }) }))
                  } else {
                    // Was on specifics, user clicked Any -> switch to Any
                    onChange(normalizeKeepMode({ ...cfg, substatsV: [], fixedSubstatsV: [], minCount: 0, substatRollBoundsV: {} }))
                  }
                  return
                }

                // Only specifics selected
                const next = others.map(token => Number(token))
                const nextBoundsV = (() => {
                  const bV = (cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>
                  const keepVarKeys = new Set(next)
                  const outV: Record<number, {min?:number;max?:number;any?:boolean}> = {}
                  for (const [k,v] of Object.entries(bV)) { const nk = Number(k); if (keepVarKeys.has(nk)) outV[nk] = v as { min?: number; max?: number; any?: boolean } }
                  return Object.keys(outV).length ? outV : undefined
                })()
                const nextMin = (cfg.autoMinCount ? Math.min(4, next.length) : ((cfg.minCount === 0 && next.length > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                // If pruning clears all per‑stat mins and there's no global min, normalize to Early.
                onChange(normalizeKeepMode({ ...cfg, substatsV: next, fixedSubstatsV: ((((cfg as unknown) as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []).filter((v: number) => next.includes(v)), minCount: nextMin, ...(nextBoundsV ? { substatRollBoundsV: nextBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }) }))
              }
              const rollIndicatorTooltip = (
                <BuilderTooltipContent
                  text={[
                    t('rollIndicatorTip1'),
                    `• ${t('rollIndicatorTip2')}`,
                    `• ${t('rollIndicatorTip3')}`,
                    `• ${t('rollIndicatorTip4')}`,
                  ].join('\n')}
                />
              )

              const renderSubstatToggle = (variant: StatVariant, options?: { dataTourId?: string }) => {
                const boundsForVariant = getBounds(variant)
                const hasMin = typeof boundsForVariant?.min === 'number'
                const min = hasMin ? Math.max(0, Math.min(5, Number(boundsForVariant?.min))) : undefined
                const hasMax = typeof boundsForVariant?.max === 'number' && isFinite(boundsForVariant.max)
                const max = hasMax ? Math.max(0, Math.min(4, Number(boundsForVariant?.max))) : undefined
                const wildcard = Boolean(boundsForVariant?.any) || (!hasMin && !hasMax)
                const selected = isSelected(variant)
                const locked = isFixed(variant)
                const indicator = selected
                  ? {
                      wildcard,
                      ...(typeof min === 'number' ? { min } : {}),
                      ...(typeof max === 'number' ? { max } : {}),
                      tooltip: rollIndicatorTooltip,
                    }
                  : undefined
                return (
                  <ToggleButton
                    key={variant}
                    value={`${variant}`}
                    onClick={(event) => cycleSubstat(variant, event)}
                    sx={buttonBorderSx(variant)}
                    data-tour-id={options?.dataTourId}
                  >
                    <SubstatToggleDisplay
                      label={t(statVariantI18nKey(variant))}
                      locked={locked}
                      selected={selected}
                      {...(indicator ? { indicator } : {})}
                      onIndicatorClick={(event) => {
                        try { event.stopPropagation() } catch {}
                        cycleForward(variant, event)
                      }}
                      onIndicatorContextMenu={(event) => {
                        event.preventDefault()
                        try { event.stopPropagation() } catch {}
                        cycleBackward(variant, event)
                      }}
                    />
                  </ToggleButton>
                )
              }
              return (
                <>
                  {/* Row 1: Any */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: TOGGLE_BUTTON_ANY_MIN_WIDTH_PX, height: TOGGLE_BUTTON_HEIGHT_PX } }}>
                  <ToggleButton value="any">{t('any')}</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
              <ToggleButtonGroup
                size="small"
                value={value}
                onChange={() => {}}
                sx={substatToggleGroupSx}
              >
                {renderSubstatToggle(StatVariant.HP_FLAT)}
                {renderSubstatToggle(StatVariant.HP)}
                {renderSubstatToggle(StatVariant.ATK_FLAT)}
                {renderSubstatToggle(StatVariant.ATK)}
                {renderSubstatToggle(StatVariant.DEF_FLAT)}
                {renderSubstatToggle(StatVariant.DEF)}
              </ToggleButtonGroup>
              {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
              <ToggleButtonGroup
                size="small"
                value={value}
                onChange={() => {}}
                sx={substatToggleGroupSx}
              >
                {renderSubstatToggle(StatVariant.SPD, { dataTourId: 'builder.substat.spd' })}
                {renderSubstatToggle(StatVariant.RES)}
                {renderSubstatToggle(StatVariant.ACC)}
                {renderSubstatToggle(StatVariant.CR, { dataTourId: 'builder.substat.cr' })}
                {renderSubstatToggle(StatVariant.CDMG, { dataTourId: 'builder.substat.cdmg' })}
              </ToggleButtonGroup>
                  {/* Context menu for roll options is intentionally disabled for now */}
                </>
              )
            })()}
          </Box>
        </FormControl>

        
        {/* Slots grid 3x3 with icons */}
        <FormControl sx={(theme) => ({
          gridColumn: '1 / 3',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })} data-tour-id="builder.slots">
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip title={<BuilderTooltipContent text={t('builderSlotsHelp')} />}>
              <span>{t('builderSlots')}</span>
            </Tooltip>
          </FormLabel>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
            {artifactTypeIconList.map(({ id, name, Icon }) => {
              const selected = (cfg.artifactTypes ?? []).includes(id)
              return (
                <Box
                  key={id}
                  onClick={() => {
                    const set = new Set(cfg.artifactTypes ?? [])
                    if (selected) set.delete(id); else set.add(id)
                    update('artifactTypes', Array.from(set))
                  }}
                   sx={{
                     border: '1px solid',
                     borderColor: selected ? 'primary.main' : 'divider',
                     borderRadius: 1,
                     px: 1,
                     py: 0,
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     width: '100%',
                     height: TOGGLE_BUTTON_HEIGHT_PX,
                     boxSizing: 'border-box',
                     cursor: 'pointer',
                     textAlign: 'center',
                     whiteSpace: 'nowrap',
                     bgcolor: selected ? 'action.selected' : 'transparent',
                   }}
                    data-tour-id={name === 'Boots' ? 'builder.slot.boots' : undefined}
                >
                  {/* Icons share the same left edge via a fixed-width flex row; text stays centered within its own column. */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: slotContentWidth ?? 'auto',
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
                        width: slotIconSize,
                        minWidth: slotIconSize,
                        mr: slotIconGap,
                      }}
                    >
                      <Icon fontSize="small" />
                    </Box>
                    <Typography
                      variant="button"
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minWidth: slotLabelFlexBasis,
                        flex: slotLabelFlexBasis ? `0 0 ${slotLabelFlexBasis}` : undefined,
                        fontSize: FONT_SIZE_BASE_PX,
                        fontFamily: theme.typography.button?.fontFamily ?? theme.typography.fontFamily,
                        fontWeight: theme.typography.button?.fontWeight ?? theme.typography.fontWeightMedium ?? 500,
                        letterSpacing: theme.typography.button?.letterSpacing,
                        lineHeight: theme.typography.button?.lineHeight ?? 1.2,
                      }}
                    >
                      {slotLabel(Number(id))}
                    </Typography>
                  </Box>
                </Box>
              )
            })}
          </Box>
        </FormControl>

        {/* Right column combined: Required substats + Sets in one grid cell */}
        <Box sx={(theme) => ({
          gridColumn: '3 / 5',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          alignSelf: 'stretch',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
        <FormControl sx={{ m: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            {/* Required substats */}
            <FormControl sx={{ m: 0 }}>
              <FormLabel sx={{ mb: 0.5 }}>
                {/* Keep the flex toggle aligned with the first line when the label wraps (e.g., long locales). */}
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'flex-start',
                    gap: 0.6,
                  }}
                >
                  <Tooltip title={<BuilderTooltipContent text={t('builderRequiredSubstatsHelp')} />}>
                    <span>{t('builderRequiredSubstats')}</span>
                  </Tooltip>
                  {(() => {
                    const flexOn = Boolean(cfg.autoSubstatFlex)
                    const flexState: 'active' | 'available' | 'disabled' = canFlexSubstats
                      ? (flexOn ? 'active' : 'available')
                      : 'disabled'
                    const FlexIconComponent = flexState === 'active' ? AutoFixHighIcon : AutoFixHighOutlinedIcon
                    return (
                  <Tooltip
                    title={<BuilderTooltipContent text={t('builderSubstatFlexToggleTooltip')} />}
                    disableHoverListener={!canFlexSubstats}
                    disableFocusListener={!canFlexSubstats}
                    disableTouchListener={!canFlexSubstats}
                  >
                    <Box
                      role="button"
                      tabIndex={canFlexSubstats ? 0 : -1}
                      onClick={() => { if (!canFlexSubstats) return; toggleSubstatFlex() }}
                      onKeyDown={(e) => { if (!canFlexSubstats) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSubstatFlex() } }}
                      aria-pressed={flexOn}
                      aria-disabled={!canFlexSubstats}
                      sx={(theme) => {
                            const disabledOpacity = theme.palette.action.disabledOpacity ?? 0.38
                            const colorMap = {
                              active: theme.palette.primary.main,
                              available: theme.palette.text.secondary,
                              disabled: theme.palette.text.disabled,
                            } as const
                            const baseColor = colorMap[flexState]
                          return {
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            ml: 0.25,
                            cursor: canFlexSubstats ? 'pointer' : 'default',
                            userSelect: 'none',
                            borderRadius: 1,
                            p: 0.25,
                            pointerEvents: canFlexSubstats ? 'auto' : 'none',
                              color: baseColor,
                              '& svg': {
                                color: baseColor,
                                opacity: flexState === 'disabled' ? disabledOpacity : 1,
                                transition: 'color 120ms ease, opacity 120ms ease',
                              },
                              '&:hover': canFlexSubstats ? {
                                color: theme.palette.primary.main,
                                '& svg': {
                                  color: theme.palette.primary.main,
                                  opacity: 1,
                                },
                              } : {},
                              '&:focus-visible': {
                                outline: `2px solid ${alpha(theme.palette.primary.main, 0.5)}`,
                                outlineOffset: 2,
                              },
                            }
                          }}
                        >
                          <FlexIconComponent fontSize="inherit" />
                        </Box>
                      </Tooltip>
                    )
                  })()}
                </Box>
              </FormLabel>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={cfg.autoMinCount ? 'auto' : (cfg.minCount > 0 ? String(cfg.minCount) : 'auto')}
                onChange={(_, v) => {
                  if (!v) return
                  if (v === 'auto') {
                    const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                    const nextMin = Math.min(4, subsV.length) as 0|1|2|3|4
                    onChange({ ...cfg, autoMinCount: true, autoSubstatFlex: false, minCount: nextMin })
                    return
                  }
                  const next = Number(v) as 1|2|3|4
                  onChange({ ...cfg, autoMinCount: false, autoSubstatFlex: false, minCount: next })
                }}
              data-tour-id="builder.required"
                sx={{
                  '& .MuiToggleButton-root': {
                    height: TOGGLE_BUTTON_HEIGHT_PX,
                    minHeight: TOGGLE_BUTTON_HEIGHT_PX,
                  },
                }}
              >
                <ToggleButton value="auto">{t('headerMenuAuto')}</ToggleButton>
                {([1,2,3,4] as const).map((n) => (
                  <ToggleButton key={n} value={String(n)}>{n}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </FormControl>
            {/* Min required rolls */}
            <FormControl sx={{ ml: 1 }}>
              <FormLabel sx={{ mb: 0.5 }}>
                {(() => {
                  const lockedCount = Array.isArray((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV)
                    ? (((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV as number[]).length)
                    : 0
                  const target = ((cfg as unknown as { substatMinTarget?: 'locked' | 'selected' }).substatMinTarget === 'locked') ? 'locked' : 'selected'
                  const canLock = lockedCount > 0
                  const lockState: 'active' | 'available' | 'disabled' = (target === 'locked')
                    ? 'active'
                    : (canLock ? 'available' : 'disabled')
                  const toggle = () => {
                    if (target === 'selected' && !canLock) return
                    const next = (target === 'selected') ? 'locked' : 'selected'
                    onChange({ ...cfg, substatMinTarget: next as 'locked' | 'selected' })
                  }
                  const tooltipContent = (
                    <BuilderTooltipContent
                      text={[
                        t('builderMinRequiredRollsTip1'),
                        `• ${t('builderMinRequiredRollsTip2')}`,
                        `• ${target === 'locked' ? t('builderMinRequiredRollsTargetLocked') : t('builderMinRequiredRollsTargetSelected')}`,
                      ].join('\n')}
                    />
                  )
                  const LockIconComponent = lockState === 'active' ? LockIcon : LockOpenOutlinedIcon
                  const interactive = canLock || target === 'locked'
                  // Keep the label text and toggle icon independent so hovering the text does not change the icon styling.
                  return (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                      <Tooltip title={tooltipContent}>
                        <Box
                          component="span"
                          sx={(theme) => ({
                            color: interactive ? theme.palette.text.secondary : theme.palette.text.disabled,
                          })}
                        >
                          {t('builderMinRequiredRolls')}
                        </Box>
                      </Tooltip>
                      <Tooltip
                        title={tooltipContent}
                        disableHoverListener={!interactive}
                        disableFocusListener={!interactive}
                        disableTouchListener={!interactive}
                      >
                        <Box
                          role="button"
                          tabIndex={interactive ? 0 : -1}
                          onClick={() => { if (!interactive) return; toggle() }}
                          onKeyDown={(e) => { if (!interactive) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
                          aria-label={t('builderMinRequiredRollsToggleAria', { target })}
                          aria-pressed={target === 'locked'}
                          aria-disabled={!interactive}
                          data-tour-id="builder.min-rolls.toggle"
                          sx={(theme) => {
                            const disabledOpacity = theme.palette.action.disabledOpacity ?? 0.38
                            const colorMap = {
                              active: theme.palette.primary.main,
                              available: theme.palette.text.secondary,
                              disabled: theme.palette.text.disabled,
                            } as const
                            const iconColor = colorMap[lockState]
                            return {
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: interactive ? 'pointer' : 'default',
                              userSelect: 'none',
                              borderRadius: 1,
                              ml: 0.25,
                              p: 0.25,
                              pointerEvents: interactive ? 'auto' : 'none',
                              '& svg': {
                                color: iconColor,
                                opacity: lockState === 'disabled' ? disabledOpacity : 1,
                                transition: 'color 120ms ease, opacity 120ms ease',
                              },
                              '&:hover': interactive ? {
                                '& svg': {
                                  color: theme.palette.primary.main,
                                  opacity: 1,
                                },
                              } : {},
                              '&:focus-visible': {
                                outline: `2px solid ${alpha(theme.palette.primary.main, 0.5)}`,
                                outlineOffset: 2,
                              },
                            }
                          }}
                        >
                          <LockIconComponent fontSize="inherit" />
                        </Box>
                      </Tooltip>
                    </Box>
                  )
                })()}
              </FormLabel>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={(cfg.autoMinRequiredRolls ? 'auto' : String((cfg.minRequiredRolls ?? 0)))}
                onChange={(_, v) => {
                  if (!v) return
                  if (v === 'auto') {
                    // Turning global min to Auto (0) may deactivate Milestone Thresholds.
                    // Normalize keep mode to Early in that case.
                    onChange(normalizeKeepMode({
                      ...cfg,
                      autoMinRequiredRolls: true,
                      minRequiredRolls: 0,
                    }))
                    return
                  }
                  const next = Math.max(0, Math.min(5, Number(v))) as 0|1|2|3|4|5
                  onChange({ ...cfg, autoMinRequiredRolls: false, minRequiredRolls: next })
                }}
              data-tour-id="builder.min-rolls"
                sx={{
                  '& .MuiToggleButton-root': {
                    height: TOGGLE_BUTTON_HEIGHT_PX,
                    minHeight: TOGGLE_BUTTON_HEIGHT_PX,
                  },
                }}
              >
                <ToggleButton value="auto">{t('headerMenuAuto')}</ToggleButton>
                {([0,1,2,3,4,5] as const).map((n) => (
                  <ToggleButton key={n} value={String(n)}>{n}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </FormControl>
            {/* Milestone Thresholds (right of Min required rolls) */}
            {(() => {
              const active = isMilestoneThresholdsActive(cfg as BuilderConfig)
              return (
                <FormControl sx={{ ml: 1 }}>
                  <FormLabel sx={{ mb: 0.5 }}>
                    <Tooltip title={<BuilderTooltipContent text={t('builderMilestoneThresholdsHelp')} />}>
                      <span>{t('builderMilestoneThresholds')}</span>
                    </Tooltip>
                  </FormLabel>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={(cfg as BuilderConfig).earlyKeepMode ?? 'early'}
                      onChange={(_, v) => {
                        if (!v) return
                        const mode = (v === 'late' ? 'late' : 'early') as 'early' | 'late'
                        onChange({ ...cfg, earlyKeepMode: mode })
                      }}
                      disabled={!active}
                      data-tour-id="builder.thresholds"
                      sx={{
                        '& .MuiToggleButton-root': {
                          height: TOGGLE_BUTTON_HEIGHT_PX,
                          minHeight: TOGGLE_BUTTON_HEIGHT_PX,
                        },
                      }}
                      >
                      <ToggleButton value="early">{t('builderEarlyLabel')}</ToggleButton>
                      <ToggleButton value="late">{t('builderLateLabel')}</ToggleButton>
                      </ToggleButtonGroup>
                  </Box>
                </FormControl>
              )
            })()}
            {/* Substat Values… moved to top row (right of Max Level) */}
          </Box>
        </FormControl>
        {/* Warning area (fixed height, single line, ellipsed, always reserved) */}
        {(() => {
          const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
          const fixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
          const chosenCount = subsV.length
          const fixedCount = fixedV.length
          const warnMin = (chosenCount < cfg.minCount) && !(chosenCount === 0 && (cfg.autoMinRequiredRolls !== false))
          const warnFixed = fixedCount > 4
          // When Flex is off and Required equals the number of locked substats while
          // other unlocked substats are also selected, the unlocked ones never fire.
          // Skip this warning when Flex permutations are active because the builder
          // rotates those optional picks into separate rules instead of dropping them.
          const hasUnlockedSelected = chosenCount > fixedCount
          const flexActive = cfg.autoSubstatFlex === true && canFlexSubstats
          const warnReqEqLocked = (cfg.minCount === fixedCount) && hasUnlockedSelected && !flexActive
          // New: detect an impossible-by-target case under simple sufficient conditions:
          // If a global MinRequiredRolls is set and even the best-case sum of per‑stat caps
          // across the required number of selected substats is below that minimum, then
          // the target cannot be met. This mirrors cases like single SPD with Max=0 and MinRequired=1.
          const warnImpossible = (() => {
            if (!(cfg.autoMinRequiredRolls === false) || !cfg.minRequiredRolls || cfg.minRequiredRolls <= 0) return false
            if (!Array.isArray(subsV) || subsV.length === 0) return false
            const m = Math.max(cfg.minCount, fixedCount)
            if (m <= 0) return false
            // Build caps per selected variant
            // UI heuristic: default per‑stat cap is 4 rolls, except when the
            // selected rarity can feasibly reach 5 rolls on a single substat
            // (e.g., exact Mythical, ≤ Mythical), or when rarity is Any — the
            // builder models Mythical when needed. This avoids false
            // "impossible" warnings for legitimate 5‑roll targets like ACC
            // with a global MinRequired=5.
            const supportsFive = (() => {
              const rc = Number((cfg as unknown as { rarityCode?: number }).rarityCode ?? 0)
              const mode = (cfg as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode
              if (rc === RarityCode.Mythical || rc === RarityCode.LTE_Mythical) return true
              if (rc === RarityCode.Any) return true
              // When Auto and the global target is 5, treat as 5‑cap capable.
              if (mode === 'auto' && (cfg.minRequiredRolls ?? 0) >= 5) return true
              return false
            })()
            const defaultCap = supportsFive ? 5 : 4
            const capFor = (v: number): number => {
              const b = (cfg.substatRollBoundsV ?? {})[Number(v)]
              const hasMax = (typeof b?.max === 'number' && isFinite(b.max))
              const raw = hasMax ? Number(b!.max) : defaultCap
              return Math.max(0, Math.min(defaultCap, raw))
            }
            const fixedCaps = fixedV.map(capFor)
            const optional = subsV.filter(v => !fixedV.includes(v))
            const optCaps = optional.map(capFor).sort((a,b)=>b-a)
            let sumCaps = 0
            // Include all fixed, then highest optional caps to fill to m
            for (const c of fixedCaps) sumCaps += c
            for (let i = 0; i < Math.max(0, m - fixedCaps.length); i++) { sumCaps += (optCaps[i] ?? 0) }
            return sumCaps < (cfg.minRequiredRolls ?? 0)
          })()
          const msg = warnMin
            ? `Warning: Required (${cfg.minCount}) > chosen (${chosenCount})`
            : (warnFixed
                ? `Warning: Fixed substats (${fixedCount}) exceed 4 — extra will be ignored`
                : (warnReqEqLocked
                    ? `Warning: Required (${cfg.minCount}) equals locked (${fixedCount}); other selected (${chosenCount - fixedCount}) will be ignored`
                    : (warnImpossible
                        ? t('builderMinRequiredRollsImpossibleWarn')
                        : '')))
          return (
            // Always reserve a compact space to avoid layout shift while keeping the gap minimal
            <Box sx={{ height: UI_SUBSTAT_WARNING_ROW_HEIGHT_PX, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
              <Typography
                variant="caption"
                color="warning.main"
                sx={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%', lineHeight: 1.2 }}
              >
                {msg}
              </Typography>
            </Box>
          )
        })()}

        {/* Sets multi-select with order toggle and search */}
        <FormControl sx={{ m: 0 }}>
          {/* Header row: label on the left, Manage metasets on the right */}
          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, mb: 0.5 }}>
            <FormLabel sx={{ mb: 0, mr: 1 }}>
              <Tooltip title={<BuilderTooltipContent text={t('builderSetsHelp')} />}>
                <span>{t('setsTitle')}</span>
              </Tooltip>
            </FormLabel>
            {/* Flexible spacer keeps the label left-aligned and the button right-aligned */}
            <Box ref={setsLeftRef} sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }} />
            <Button size="small" variant="outlined" onClick={openMetaDlg} sx={{ minWidth: 160, whiteSpace: 'nowrap', ml: 'auto' }} data-tour-id="builder.manage-metasets">{t('builderManageMetasetsButton')}</Button>
          </Box>
          {(() => {
            const tokenOf = {
              meta: (id: string) => `m:${id}`,
              set: (id: number) => `s:${id}`,
            }
            // use parent-level metaSetsMenuOpen state to track Select menu visibility
            const selectedTokens: string[] = [
              ...(cfg.artifactMetaSets ?? []).map(tokenOf.meta),
              ...(cfg.artifactSets ?? []).map(tokenOf.set).map(String),
            ]
            const handleChange = (e: SelectChangeEvent<string[]>) => {
              const tokens = e.target.value as string[]
              const metaIds = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
              const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
              onChange({ ...cfg, artifactMetaSets: metaIds, artifactSets: setIds })
            }
            const renderValue = (tokens: string[]) => {
              const any = !tokens || tokens.length === 0
              const names: string[] = []
              if (!any) {
                for (const token of tokens) {
                  if (token.startsWith('m:')) {
                    const id = token.slice(2)
                    const m = metasets.find(x => x.id === id)
                    if (m) names.push(m.name)
                  } else if (token.startsWith('s:')) {
                    const id = Number(token.slice(2))
                    names.push(t(artifactSetI18nKey(id)))
                  }
                }
              }
              const text = (any || names.length === 0) ? t('any') : names.join(', ')
              return (
                <EllipsisTooltip title={text} wrap="block">
                  <Box
                    component="span"
                    data-ellipsis-target
                    sx={{
                      display: 'block',
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {text}
                  </Box>
                </EllipsisTooltip>
              )
            }
            const fullRenderedValue = renderValue(selectedTokens)
            // Build set list per order/search (shared helper keeps behavior consistent)
            const sorted = filterAndSortSetEntries(setsSearch, setsOrder)

            // Show metasets section only when there is at least one visible user metaset. Avoid empty metasets UI.
            const hasMetasetsSection = metasets.some(m => m.show !== false)
            const metasetsMenu: Metaset[] = metasets.filter(m => m.show !== false)

              return (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 520px) auto', gap: 1, alignItems: 'start', minWidth: 0, maxWidth: '100%' }}>
                <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 32, overflow: 'hidden' }}>
                  {(() => {
                    const selectEl = (
                      <Select
                        size="small"
                        multiple
                        value={selectedTokens}
                        onChange={handleChange}
                        onOpen={(e) => {
                          setMetaSetsMenuOpen(true)
                          try {
                            const el = (e?.currentTarget as HTMLElement | null)
                            const rect = el?.getBoundingClientRect()
                            const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
                            const margin = 8
                            // Theoretical max height depends on whether the Metasets section is present.
                            const theoreticalMax = hasMetasetsSection
                              ? (MENU_MAX_HEIGHT_METASETS_PX + MENU_MAX_HEIGHT_SETS_LIST_PX + MENU_MAX_HEIGHT_EXTRA_BUFFER)
                              : (MENU_MAX_HEIGHT_SETS_LIST_PX + MENU_MAX_HEIGHT_EXTRA_BUFFER)
                            const desiredTop = rect ? Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - theoreticalMax - margin)) : margin
                            const desiredLeft = rect ? Math.floor(rect.left) : margin
                            setSetsMenuAnchorPos({ top: desiredTop, left: desiredLeft })
                            // After the menu mounts, measure and refine the anchor using real height.
                            const refine = () => {
                              try {
                                const paper = setsMenuPaperRef.current
                                const measured = paper ? Math.ceil(paper.offsetHeight) : 0
                                if (rect && measured > 0) {
                                  const maxHeight = Math.min(measured, viewportH - margin * 2) + MENU_MAX_HEIGHT_EXTRA_BUFFER
                                  const top = Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - maxHeight - margin))
                                  setSetsMenuAnchorPos({ top, left: desiredLeft })
                                }
                              } catch {}
                            }
                            // Double rAF to wait for mount + layout
                            requestAnimationFrame(() => requestAnimationFrame(refine))
                          } catch { setSetsMenuAnchorPos(null) }
                        }}
                        onClose={() => { setMetaSetsMenuOpen(false); setHoveredSetMetaId(null); setSetsMenuAnchorPos(null) }}
                        renderValue={renderValue}
                        displayEmpty
                        sx={{
                          ...selectBoxHeightSx,
                          width: '100%',
                          minWidth: 0,
                          '& .MuiSelect-select': {
                            ...selectContentHeightSx,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                          },
                        }}
                        data-tour-id="builder.sets"
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX },
                              maxWidth: SETS_MENU_WIDTH_PX,
                              overflowX: 'hidden',
                            },
                            ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el }
                          },
                          MenuListProps: {
                            sx: { width: '100%', maxWidth: '100%' },
                          },
                          ...(setsMenuAnchorPos
                            ? {
                                anchorReference: 'anchorPosition' as const,
                                anchorPosition: setsMenuAnchorPos,
                                transformOrigin: { vertical: 'top', horizontal: 'left' as const },
                              }
                            : {
                                transformOrigin: { vertical: 'top', horizontal: 'left' as const },
                              }),
                        }}
                      >
                      {/* Metasets section in its own scroll area (hidden if none) */}
                      {hasMetasetsSection && (
                        <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                          <Box
                            component="ul"
                            sx={{
                              listStyle: 'none',
                              p: 0,
                              m: 0,
                              maxHeight: MENU_MAX_HEIGHT_METASETS_PX,
                              overflowY: 'auto',
                              pr: `${MENU_SCROLL_GUTTER_PX}px`,
                              scrollbarGutter: 'stable both-edges',
                            }}
                            data-tour-id="menu.metasets.section"
                          >
                            <ListSubheader sx={LIST_SUBHEADER_SX}>Metasets</ListSubheader>
                            {metasetsMenu.map((m) => {
                              const setNames = m.sets.map((id) => t(artifactSetI18nKey(id))).filter(Boolean)
                              const joined = setNames.join(', ')
                              const usedMeta = metasetUsageCounts[m.id] || 0
                              const isSelectedMeta = selectedTokens.includes(`m:${m.id}`)
                              return (
                                <MenuItem
                                  key={m.id}
                                  value={`m:${m.id}`}
                                  selected={isSelectedMeta}
                                  onMouseEnter={() => setHoveredSetMetaId(m.id)}
                                  onMouseLeave={() => setHoveredSetMetaId((prev) => (prev === m.id ? null : prev))}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    const token = `m:${m.id}`
                                    const tokensSet = new Set<string>(selectedTokens)
                                    if (tokensSet.has(token)) tokensSet.delete(token); else tokensSet.add(token)
                                    const tokens = Array.from(tokensSet)
                                    const metaIds = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
                                    const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
                                    onChange({ ...cfg, artifactMetaSets: metaIds, artifactSets: setIds })
                                  }}
                                  sx={(theme) => ({
                                    '&.Mui-selected': {
                                      backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_ALPHA),
                                      '&:hover': { backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_HOVER_ALPHA) },
                                    },
                                  })}
                                >
                                  <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                                      <EllipsisTooltip title={m.name}>
                                        <Typography noWrap data-ellipsis-target>{m.name}</Typography>
                                      </EllipsisTooltip>
                                      {m.sets.length > 0 && (
                                        <Typography variant="caption" sx={{ color: 'primary.main' }}>
                                          ({m.sets.length} set(s))
                                        </Typography>
                                      )}
                                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('setsUsageInConfigs', { n: usedMeta })}</Typography>
                                    </Box>
                                    {setNames.length > 0 && (
                                      <EllipsisTooltip title={joined} selector=".MuiTypography-caption">
                                        <Typography
                                          variant="caption"
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
                      {/* Sets section in its own scroll area (icons or list) */}
                      <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                        {/* Keep header outside the scrollable list to avoid width changes when scrollbars appear */}
                        <ListSubheader sx={[LIST_SUBHEADER_SX, { py: 0.5, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, boxSizing: 'border-box', width: `calc(100% - ${MENU_SCROLL_GUTTER_PX}px)` }]}>
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
                                onSetsOrderChange={(v: 'game' | 'az' | 'icons') => v && setSetsOrder(v)}
                                zeroResults={filterAndSortSetEntries(setsSearch, setsOrder).length === 0}
                              />
                            </Box>
                          </Box>
                        </ListSubheader>
                        <Box
                          component="ul"
                          sx={{
                            listStyle: 'none',
                            p: 0,
                            m: 0,
                            ...(setsOrder === 'icons'
                              ? {
                                  // Icon mode: never scroll; grid expands with content
                                  maxHeight: 'none',
                                  height: 'auto',
                                  overflowY: 'visible',
                                }
                              : {
                                  // List modes: fixed height with scrolling
                                  maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX,
                                  height: MENU_MAX_HEIGHT_SETS_LIST_PX,
                                  overflowY: 'auto',
                                }),
                            // Reserve a stable right padding so hover indicators
                            // remain visible and width does not change when scrollbars appear
                            pr: `${MENU_SCROLL_GUTTER_PX}px`,
                            scrollbarGutter: 'stable both-edges' as const,
                          }}
                        >
                          <SetMenuSection
                            title={t('setsTitle')}
                            sorted={sorted}
                            setsOrder={setsOrder}
                            metasets={metasets}
                            excludeMetasetId={null}
                            setUsageCounts={setUsageCounts}
                            valueForSet={(id) => `s:${id}`}
                            // Header rendered above; keep items-only here
                            hideHeader
                            hoveredMetasetId={hoveredSetMetaId}
                            selectedMetasetIds={(cfg.artifactMetaSets ?? [])}
                            selectedSetIds={selectedTokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))}
                            onToggleSet={(id) => {
                              // Toggle explicit set selection without relying on MUI's internal handler.
                              const prev = new Set<number>(cfg.artifactSets ?? [])
                              if (prev.has(id)) prev.delete(id); else prev.add(id)
                              const nextSets = Array.from(prev)
                              nextSets.sort((a, b) => a - b)
                              onChange({ ...cfg, artifactSets: nextSets })
                            }}
                          />
                        </Box>
                      </Box>
                      </Select>
                    )
                    // Keep a stable wrapper to prevent the Select from remounting
                    // when transitioning from empty to non-empty selections, which
                    // could close the menu after the first click.
                    return (
                      <EllipsisTooltip
                        title={fullRenderedValue}
                        selector=".MuiSelect-select"
                        wrap="block"
                        // Disable while menu is open to avoid layout measurements.
                        disabled={metaSetsMenuOpen}
                      >
                        {selectEl}
                      </EllipsisTooltip>
                    )
                  })()}
                </Box>
                {(() => {
                  const hasAnySelection = ((cfg.artifactMetaSets?.length ?? 0) + (cfg.artifactSets?.length ?? 0)) > 0
                  return (
        <Button
          size="small"
          color="warning"
          onClick={openConfirmClearSets}
          disabled={!hasAnySelection}
          sx={{ height: TOGGLE_BUTTON_HEIGHT_PX, minHeight: TOGGLE_BUTTON_HEIGHT_PX, whiteSpace: 'nowrap' }}
        >
          {t('clear')}
        </Button>
                  )
                })()}
              </Box>
            )
          })()}
        </FormControl>
        {/* Bottom-right editing label anchored to remaining vertical space */}
        <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
          {(!multiselectActive && editingIndex !== null && isDirty) && (
            <Box component="span" aria-label={t('builderUnsavedChangesAria')}
                 sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'error.main', display: 'inline-block' }} />
          )}
          {(() => {
            const editingLabelPlaceholderIndex = 88
            // Reserve horizontal space even when nothing is selected by hiding a representative label.
            const labelText = multiselectActive
              ? t('multiselectLabel')
              : t('editingConfigNumbered', { n: (editingIndex !== null ? editingIndex + 1 : editingLabelPlaceholderIndex) })
            const labelVisible = multiselectActive || editingIndex !== null
            return (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ visibility: labelVisible ? 'visible' : 'hidden' }}
              >
                {labelText}
              </Typography>
            )
          })()}
        </Box>
        </Box>

      </Box>

        {/* Metasets dialog (separate component) */}
        <MetasetsDialog
          open={metaDlgOpen}
          onClose={closeMetaDlg}
          metasets={metasets}
          onMetasetsChange={onMetasetsChange}
          onDeleteMetaset={onDeleteMetaset}
          setUsageCounts={setUsageCounts}
          metasetUsageCounts={metasetUsageCounts}
          onSelectConfigsByMetaset={onSelectConfigsByMetaset}
          setsSearch={setsSearch}
          onSetsSearchChange={setSetsSearch}
          setsOrder={setsOrder}
          onSetsOrderChange={(v) => v && setSetsOrder(v)}
          metaSetsMenuOpen={metaSetsMenuOpen}
          setMetaSetsMenuOpen={setMetaSetsMenuOpen}
        />

        <MinimaDialog open={minimaDialogOpen} onClose={onCloseMinimaDialog} minima={minima} onMinimaChange={onMinimaChange} />

        {/* Confirm Clear Sets selection */}
        <Dialog open={confirmClearSets} onClose={closeConfirmClearSets}>
          <DialogTitle>Clear selected sets?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('builderMsgClearSets')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeConfirmClearSets}>Cancel</Button>
            <Button color="warning" onClick={() => { closeConfirmClearSets(); onChange({ ...cfg, artifactSets: [], artifactMetaSets: [] }) }}>Clear</Button>
          </DialogActions>
        </Dialog>
      {/* Small separator above action buttons (matching the one below) */}
      <Divider sx={{ my: 1, opacity: 0.5 }} />

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Button onClick={handleAddToCustom} data-tour-id="builder.add-config" sx={{ width: BUILDER_ADD_BUTTON_WIDTH_PX, whiteSpace: 'nowrap' }}>
          <Typography component="span" sx={[ELLIPSIS_TEXT_SX, { fontSize: FONT_SIZE_BASE_PX }]}>
            {editingIndex !== null ? t('builderInsertAfterSelected') : t('builderAddAsNew')}
          </Typography>
        </Button>
        <Button
          onClick={() => {
            if (editingIndex === null) return
            commitNameDraftIfNeeded()
            onUpdateSelected()
          }}
          disabled={
            editingIndex === null || !isDirty
          }
          sx={(theme) => ({
            width: BUILDER_ADD_BUTTON_WIDTH_PX,
            whiteSpace: 'nowrap',
            ...(isDirty && editingIndex !== null ? {
              // Animated pulsing glow
              '--pulse-inset': `${alpha(theme.palette.primary.main, 0.55)}`,
              '--pulse-outer': `${alpha(theme.palette.primary.main, 0.45)}`,
              animation: `${kfSavePulse} 2400ms ease-in-out infinite`,
              transition: 'box-shadow 180ms ease-in-out',
            } : {}),
            // Merge attention effect style when active; use a safe cast since the hook returns an object
            ...(isDirty && editingIndex !== null && suiteSx ? (suiteSx as unknown as Record<string, unknown>) : {}),
          })}
          title={t('builderSaveChangesToSelected')}
          onMouseEnter={() => {
            if (attentionPhase) {
              setAttentionState({ phase: false, burst: false })
              setInteractionNonce(n => n + 1)
            }
          }}
        >
          <Typography component="span" className="attention-text" sx={[ELLIPSIS_TEXT_SX, { fontSize: FONT_SIZE_BASE_PX }]}>
            {t('builderSaveChangesToSelected')}
          </Typography>
        </Button>
        <Chip
          size="small"
          label={
            counting
              ? t('counting')
              : (ruleCount === null
                ? '—'
                : formatRulesCount(t, ruleCount))
          }
          sx={{ ml: 0.5 }}
        />
        <Box sx={{ flex: 1 }} />
        <Box
          component="span"
          onContextMenu={(e) => { e.preventDefault(); setResetMenuAnchor(e.currentTarget as HTMLElement) }}
        >
          <Button
            size="small"
            variant="outlined"
            color="error"
            disabled={isDefaultBuilder}
            onMouseEnter={() => setHoverReset(true)}
            onMouseLeave={() => setHoverReset(false)}
            onClick={() => setConfirmResetBuilder(true)}
          >
            {t('resetToDefaults')}
          </Button>
        </Box>
        <Menu
          anchorEl={resetMenuAnchor}
          open={Boolean(resetMenuAnchor)}
          onClose={() => setResetMenuAnchor(null)}
        >
          {(() => { void defaultsEpoch; return null })()}
          <MenuItem
            onClick={() => setAutoResetAfterInsert(v => !v)}
          >
            <Checkbox
              size="small"
              checked={autoResetAfterInsert}
              onChange={(e) => setAutoResetAfterInsert(Boolean(e.target.checked))}
              sx={{ mr: 1, p: 0.5 }}
            />
            Auto reset after Insert
          </MenuItem>
          <MenuItem
            onClick={() => {
              setResetMenuAnchor(null)
              // Save current as user defaults. If identical to factory defaults,
              // remove the override to keep storage clean and restore factory behavior.
              const factory: BuilderConfig = {
                name: '', keep: true, rankCode: 0, rarityCode: 0, rarityMode: 'auto', factionCode: 0,
                mainStatsV: [], minLevel: 0, maxLevel: 16, rollMode: 'auto', rollBaseline: 'afterStart', earlyKeepMode: 'early',
                substatsV: [], fixedSubstatsV: [], minCount: 0, autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
                substatRollBoundsV: {}, artifactTypes: [], artifactSets: [], artifactMetaSets: [], substatMinTarget: 'selected',
              }
              const current: BuilderConfig = {
                name: cfg.name ?? '',
                keep: cfg.keep,
                rankCode: cfg.rankCode,
                rarityCode: cfg.rarityCode,
                rarityMode: (cfg.rarityMode ?? 'auto'),
                factionCode: (cfg.factionCode ?? 0),
                mainStatsV: (cfg.mainStatsV ?? []),
                minLevel: (cfg.minLevel ?? 0),
                maxLevel: (cfg.maxLevel ?? 16),
                rollMode: (cfg.rollMode ?? 'auto'),
                rollBaseline: (cfg.rollBaseline ?? 'afterStart'),
                earlyKeepMode: (cfg.earlyKeepMode ?? 'early'),
                substatsV: (cfg.substatsV ?? []),
                fixedSubstatsV: (cfg.fixedSubstatsV ?? []),
                minCount: cfg.minCount,
                autoMinCount: Boolean(cfg.autoMinCount ?? true),
                autoSubstatFlex: Boolean((cfg as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false),
                minRequiredRolls: Number(cfg.minRequiredRolls ?? 0) as 0|1|2|3|4|5,
                autoMinRequiredRolls: Boolean(cfg.autoMinRequiredRolls ?? true),
                substatRollBoundsV: (cfg.substatRollBoundsV ?? {}),
                artifactTypes: (cfg.artifactTypes ?? []),
                artifactSets: (cfg.artifactSets ?? []),
                artifactMetaSets: (cfg.artifactMetaSets ?? []),
                substatMinTarget: ((cfg.substatMinTarget === 'locked') ? 'locked' : 'selected'),
              }
              const same = JSON.stringify(current) === JSON.stringify(factory)
              try {
                if (same) {
                  localStorage.removeItem(BUILDER_USER_DEFAULTS_KEY)
                } else {
                  localStorage.setItem(BUILDER_USER_DEFAULTS_KEY, JSON.stringify(current))
                }
              } catch {}
              setDefaultsEpoch((x) => x + 1)
            }}
          >
            Save local settings as user defaults
          </MenuItem>
          <MenuItem
            disabled={(() => { try { return !localStorage.getItem(BUILDER_USER_DEFAULTS_KEY) } catch { return true } })()}
            onClick={() => {
              setResetMenuAnchor(null)
              // Reset the builder to factory defaults explicitly
              onChange({
                ...cfg,
                keep: true,
                rankCode: 0,
                rarityCode: 0,
                rarityMode: 'auto',
                factionCode: 0,
                name: '',
                mainStatsV: [],
                minLevel: 0,
                maxLevel: 16,
                rollMode: 'auto',
                rollBaseline: 'afterStart',
                earlyKeepMode: 'early',
                minCount: 0,
                autoMinCount: true,
                minRequiredRolls: 0,
                autoMinRequiredRolls: true,
                substatsV: [],
                fixedSubstatsV: [],
                substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }>,
                artifactTypes: [],
                artifactSets: [],
                artifactMetaSets: [],
                substatMinTarget: 'selected',
              })
            }}
          >
            Reset to factory defaults
          </MenuItem>
        </Menu>
        <Dialog open={confirmResetBuilder} onClose={() => setConfirmResetBuilder(false)}>
          <DialogTitle>Reset builder to defaults?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('builderMsgClearBuilder')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmResetBuilder(false)}>Cancel</Button>
            <Button color="error" onClick={() => {
              setConfirmResetBuilder(false)
              const eff = getEffectiveDefaults()
              onChange({ ...cfg, ...eff })
            }}>Reset</Button>
          </DialogActions>
        </Dialog>
      </Stack>
      <Divider sx={{ mt: 1, opacity: 0.5 }} />
    </Box>
  )
}
