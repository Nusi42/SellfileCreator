import { scopeColorsText } from '../lib/colorScope'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { elementScroll, useVirtualizer } from '@tanstack/react-virtual'
import type { VirtualizerOptions } from '@tanstack/react-virtual'
import { Box, Button, ButtonBase, Divider, Menu, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { keyframes, useTheme, useColorScheme } from '@mui/material/styles'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import StarIcon from '@mui/icons-material/Star'
import LocalOfferIcon from '@mui/icons-material/LocalOffer'
import SellIcon from '@mui/icons-material/Sell'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import type { HsfRule } from '../lib/hsfTypes'
import { RULE_SOURCE_FINAL_SELL, RULE_SOURCE_HSF, RULE_SOURCE_SFC, RULE_SOURCE_SAFEGUARDS, type HsfRuleWithRecipe, type RuleSource } from '../lib/merge'
import type { ChipHoverTarget } from '../lib/chipHoverBridge'
import { /* formatArtifactSets */ formatLevel, formatRank, /* labelOfVariant, */ mainToVariant, rarityCodeToName, artifactSetName, compareArtifactTypes, artifactTypeI18nKey, statVariantI18nKey, compareArtifactSets, factionI18nKey, type FactionId, getLocalizedGearSetName } from '../lib/types'
import EllipsisTooltip from './EllipsisTooltip'
import MarkdownTooltip from './MarkdownTooltip'
	import {
	  NBSP,
	  MENU_CONTROL_HEIGHT_PX,
	  MENU_CONTROL_MIN_WIDTH_PX,
	  RULES_TABLE_OVERSCAN_IDLE,
	  RULES_TABLE_FIXED_ROW_HEIGHT_PX,
	  RULES_TABLE_SEPARATOR_ROW_HEIGHT_PX,
	  RULES_TABLE_HOVER_PROPAGATION_MS,
	  RULES_TABLE_SCROLL_HINT_HIDE_MS,
	  FONT_SIZE_BASE_PX,
  RULE_COUNT_LIMIT,
  SELECTION_SCROLL_SOURCE_SELECT_RULE,
  RULES_TABLE_WRAP_ROWS_KEY,
  type SelectionScrollRequest,
  FONT_FAMILY_MONO,
} from '../lib/constants'
import { useDisplayPreferences } from '../state/preferencesState'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon, SET_ICON_PX } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import { useI18n, type TranslateFn } from '../lib/i18n'
import RuleSubstatChips from './RuleSubstatChips'
import { renderColoredStatText } from '../lib/renderColoredStatText'
import { useRarityLabelColorMap } from '../lib/rarityColorContext'
import { formatRuleSubstatSummary, formatRuleSubstatPlain, normalizeRuleSubstats, type RuleSubstatDetail } from '../lib/substatDisplay'
import { resolveSafeguardRuleLabel } from '../lib/safeguards'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useContextMenuButtonHint } from '../hooks/useContextMenuButtonHint'
import { CONTEXT_HINT_IDS } from '../hooks/contextMenuHintIds'
import { useRulesTableColumnsPreference, type StoredColumnConfig } from '../state/rulesTableColumnsPreference'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { HEADER_MENU_LABEL_SX } from './tableHeaderMenuStyles'
import { CycleButton } from './CycleButton'
import { MenuToggleRow } from './MenuToggleRow'
import { EmptyStateMessage } from './EmptyStateMessage'
import { getRuleRecipeIndex, resolveMatchRecipeName } from '../lib/ruleRecipeIndex'
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import { resolveDisabledOpacity } from './disabledOpacity'
import { ensureContrastOnBg } from '../lib/colorUtils'
import { resolveSchemePaper, schemeModeFromColorScheme } from '../lib/themeCustomTokens'
import { TINT, ALPHA } from '../lib/colorTints'

// Preview rows stay at their fixed height (≈30px). Keep the inline faction icon
// slightly smaller than the default select size so the row metrics remain
// unchanged when toggling the "Factions as icons" option.
const FACTION_ICON_PREVIEW_PX = 20 as const
const FACTION_ICON_PREVIEW_SCALE = 1.2 as const
// Nudge the faction icon vertically so the glyph aligns with the centered text baseline.
const FACTION_ICON_PREVIEW_OFFSET_PX = 0 as const
// Single-line spans now stay centered with no vertical nudge; keep the constant for quick tuning across browsers.
const SINGLE_LINE_PREVIEW_OFFSET_PX = 3 as const
// Builder recipes map rows via RecipeID (1-based). Base rules, safeguard injections, and other
// recipe-less rows omit RecipeID, so they should not participate in recipe selection math.
// Enter animation duration for new rule rows (ms).  Short so it doesn't slow the user down.
const RULE_ROW_ENTER_ANIMATION_MS = 200
// New rule rows slide in from a slight left offset to draw attention without feeling heavy.
const RULE_ROW_ENTER_KEYFRAMES = keyframes`
  from {
    opacity: 0;
    transform: translateX(-6px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`
// Change-pulse duration for existing rows whose content was modified (ms).
// Longer than enter so the brief flash is legible without being distracting.
const RULE_ROW_CHANGE_PULSE_MS = 350
// Warm background flash signals that a row's content changed without repositioning it.
const RULE_ROW_CHANGE_PULSE_KEYFRAMES = keyframes`
  0%   { background-color: inherit; }
  35%  { background-color: var(--rule-row-change-bg); }
  100% { background-color: inherit; }
`

// Module-level wrapper that renders a single artifact-type slot icon by type ID.
// Uses createElement instead of a capitalized local variable so the lint rule does not
// flag the dynamic icon lookup as "component created during render" — the icon components
// are pre-built module-level singletons resolved once per call.
function SlotIconCell({ typeId }: { typeId: number }): React.ReactElement | null {
  const Icon = artifactTypeIconFor(typeId)
  if (!Icon) return null
  // Use a plain span + inline style to sidestep MUI Box prop-typing with createElement.
  return React.createElement(
    'span',
    { style: { display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' } },
    React.createElement(Icon, { fontSize: 'inherit' }),
  )
}

// Stable animation key for a rule row, used by both enter and change-pulse tracking.
// SFC recipe rows use RecipeID (stable across inserts/deletes) so inserting a new
// recipe does not make adjacent rows look new.  Non-recipe rows fall back to lineIdx
// (positional) because they have no persistent identity across worker results.
function computeRuleAnimKey(rule: HsfRuleWithRecipe, fallbackIdx: number): string {
  const recipeIdx = getRuleRecipeIndex(rule)
  const lineIdx = typeof rule.__lineIdx === 'number' ? rule.__lineIdx : fallbackIdx
  // SFC recipe rows: RecipeID is a durable 1-based identifier assigned by the builder.
  if (rule.__source === RULE_SOURCE_SFC && recipeIdx !== null) return `sfc_${recipeIdx}`
  // Safeguard injection rows share space with their associated recipe; prefix prevents collisions.
  if (rule.__source === RULE_SOURCE_SAFEGUARDS) return `sg_${recipeIdx ?? lineIdx}`
  // Base HSF and final-sell rows have no stable ID — position is the best proxy.
  return `base_${lineIdx}`
}

const resolveDisplayRecipeIdx = (rule: HsfRuleWithRecipe | null | undefined): number | null => {
  const idx = getRuleRecipeIndex(rule ?? null)
  return idx !== null && idx >= 0 ? idx : null
}

// Which kind of group a preview separator heads — drives the leading glyph + index display.
export type SeparatorGlyphKind = 'recipe' | 'safeguard' | 'finalSell' | 'base'

// Render-only descriptor for an unselectable group-separator row in the preview table.
export type PreviewGroupSeparator = {
  kind: 'separator'
  groupKey: string
  glyphKind: SeparatorGlyphKind
  // 1-based recipe index / safeguard ordinal; null for final-sell + base groups.
  indexLabel: number | null
  label: string
  // Recipe fg color (raw, pre-contrast) when the group is a recipe; '' otherwise.
  color: string
  // How many rules (rows) this group generates.
  count: number
}

// Map a group kind to its leading glyph. Chosen to match the app's existing glyph vocabulary
// without clashing: tag = recipe (LocalOffer, used for named tags), star = safeguard (the
// established safeguard = star concept), sell-tag = final sell, inventory box = imported base.
function separatorGlyphFor(kind: SeparatorGlyphKind): React.ReactElement {
  if (kind === 'safeguard') return <StarIcon fontSize="inherit" aria-hidden />
  if (kind === 'finalSell') return <SellIcon fontSize="inherit" aria-hidden />
  if (kind === 'base') return <Inventory2OutlinedIcon fontSize="inherit" aria-hidden />
  return <LocalOfferIcon fontSize="inherit" aria-hidden />
}

// Unselectable separator row: a slim group heading (glyph → index + name → rule count).
// It carries no index column value, no `data-row-index` / `data-recipe-idx` / `data-safeguard-ordinal`
// (so it never participates in selection, hover, or the rule-height CSS), and ignores pointer events.
function SeparatorRow({
  separator,
  colSpan,
  surfacePaper,
  wrapRows,
  measureElement,
  dataIndex,
  t,
}: {
  separator: PreviewGroupSeparator
  colSpan: number
  surfacePaper: string
  wrapRows: boolean
  measureElement: (el: HTMLTableRowElement | null) => void
  dataIndex: number
  t: TranslateFn
}): React.ReactElement {
  // Contrast-adapt the recipe colour against the (neutral-tinted) header surface so it stays legible.
  const accent = separator.color ? ensureContrastOnBg(separator.color, surfacePaper) : ''
  // Entry-count suffix, singular/plural localized.
  const countText = separator.count === 1
    ? t('previewGroupSeparatorEntriesOne')
    : t('previewGroupSeparatorEntriesMany', { n: separator.count })
  // Compose "«index». «name»" — index is omitted for final-sell / base groups, and the
  // name is omitted for an unnamed recipe (empty label) so the heading reads "«index»."
  // instead of a dangling "«index». " with trailing whitespace.
  const heading = separator.indexLabel !== null
    ? (separator.label ? `${separator.indexLabel}. ${separator.label}` : `${separator.indexLabel}.`)
    : separator.label
  return (
    <TableRow
      hover={false}
      // TanStack measurement maps DOM nodes back to display items via data-index.
      data-index={dataIndex}
      // Tag for styling/testing; intentionally NOT data-row-index (keeps separators off the rule-height CSS + selection queries).
      data-row-type="separator"
      // Measure in wrap mode so dynamic heights stay accurate; fixed mode uses the estimate.
      ref={(el) => {
        if (!el) return
        if (!wrapRows) return
        measureElement(el)
      }}
      sx={{
        // Neutral group-header surface (text-primary a06) — reads as a divider, not a record.
        backgroundColor: TINT.neutralHeaderBg,
        // Left accent in the recipe colour ties the heading to its chip; falls back to the divider.
        borderLeft: '3px solid',
        borderLeftColor: accent || 'divider',
        // Separators are inert: no hover, no pointer interaction, no text selection.
        cursor: 'default',
        userSelect: 'none',
        '& > td': { py: 0.25, borderBottom: 0 },
      }}
    >
      <TableCell colSpan={colSpan}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            minWidth: 0,
            // Glyph + index + name take the recipe colour; count stays muted.
            color: accent || 'text.secondary',
            fontWeight: 600,
            lineHeight: 1.1,
          }}
        >
          {/* Leading glyph: recipe vs safeguard vs final-sell vs base. */}
          <Box component="span" sx={{ display: 'inline-flex', fontSize: '1rem', flex: '0 0 auto' }}>
            {separatorGlyphFor(separator.glyphKind)}
          </Box>
          {/* Index + name, truncated to a single line. */}
          <EllipsisTooltip title={heading}>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {heading}
            </Box>
          </EllipsisTooltip>
          {/* Trailing rule count, muted + lighter weight. */}
          <Box
            component="span"
            sx={{ ml: 0.5, flex: '0 0 auto', color: 'text.secondary', fontWeight: 400, opacity: ALPHA.a90 }}
          >
            {countText}
          </Box>
        </Box>
      </TableCell>
    </TableRow>
  )
}

export type SafeguardStarSelection = {
  // 1-based ordinal matching __safeguardRuleOrdinal on HsfRuleWithRecipe; null for malformed rows.
  safeguardRuleOrdinal: number | null
  safeguardItemKey: number | null
  isPlaceholder: boolean
}

export function HsfRulesTable({ rules, recipeNames = [], recipeFgColors = [], onHoverChipTarget, selectedRecipeIdx, selectedSafeguardOrdinal = null, multiselectActive, selectionScrollRequest, onSelectRecipeIdx, onSelectSafeguardRule, onActivateRuleRow, onRecipeAction, onClearBase, onConfigureFinalSell, substatColors, emptyStateVerticalAlign = 'center', emptyDueToFilter = false, limitExceeded = false, focusRuleIndex = null, onFocusRuleSettled, isSideBySide = false }: {
  rules: HsfRuleWithRecipe[]
  recipeNames?: readonly (string | null | undefined)[]
  recipeFgColors?: readonly (string | null | undefined)[]
  // Hover→chip link: emits the source chip target (recipe OR safeguard) for the hovered row, or null.
  onHoverChipTarget: (target: ChipHoverTarget) => void
  selectedRecipeIdx: number | null
  // 1-based safeguard ordinal to highlight (mirrors selectedRecipeIdx for safeguard rows).
  selectedSafeguardOrdinal?: number | null
  multiselectActive: boolean
  // Explicit scroll request for selection-driven preview jumps.
  selectionScrollRequest: SelectionScrollRequest
  onSelectRecipeIdx: (idx: number) => void
  // Safeguard star rows route either to Gear Inspector or Safeguards management.
  onSelectSafeguardRule?: (selection: SafeguardStarSelection) => void
  // Whole-row activation: route a clicked preview row to its source recipe/safeguard,
  // switching builder view mode and scrolling the source into view. Receives the clicked rule
  // so App can resolve its provenance (recipe idx / safeguard ordinal) and delegate.
  onActivateRuleRow?: (rule: HsfRuleWithRecipe) => void
  onRecipeAction: (idx: number, action: 'duplicate' | 'delete' | 'copy' | 'paste_after' | 'move_top' | 'move_bottom' | 'move_up' | 'move_down') => void
  onClearBase: () => void
  onConfigureFinalSell: () => void
  substatColors: Record<number, { fg: string; bg: string }>
  // Empty overlays should anchor to the top in stacked layout, but remain centered side-by-side.
  emptyStateVerticalAlign?: React.ComponentProps<typeof EmptyStateMessage>['verticalAlign']
  emptyDueToFilter?: boolean
  limitExceeded?: boolean
  // Optional external scroll target: rule index in the current rules array
  focusRuleIndex?: number | null
  onFocusRuleSettled?: () => void
  // True whenever the builder/preview render side-by-side (native fluid OR forced-zoom). Drives the
  // preview table's full-height mode; replaces a stale hardcoded `@media (min-width:2320px)` that no
  // longer matches the dynamic-zoom layout (canvas width is now SIDE_BY_SIDE_TARGET_WIDTH_PX).
  isSideBySide?: boolean
}) {
  // TanStack Virtual's useVirtualizer returns functions incompatible with the React Compiler's
  // memoization model; opt out of compilation for this component to silence the warning.
  'use no memo'
  const { t, lang } = useI18n()
  // Rarity word → adapted colour, for tinting the rarity portion of the Rank·Rarity cell (and any
  // other plain text run through the colorizer). Empty when the master colour flag is off.
  const rarityLabelColors = useRarityLabelColorMap()
  const theme = useTheme()
  // Runtime scheme paper for contrast math — theme.palette.* is frozen to light with cssVariables.
  const { colorScheme } = useColorScheme()
  const previewSurfacePaper = resolveSchemePaper(theme, schemeModeFromColorScheme(colorScheme))
  // Reuse the shared disabled opacity so rows dim consistently with chips.
  const disabledOpacity = resolveDisabledOpacity(theme)
  // Icon toggles + stat scope still drive the table body; the colour-scope master toggle and
  // colour-blind cycle moved to the central theme popout, so their setters live there now.
  const { showSlotIcons, showSetIcons, showFactionIcons, statColorScope } = useDisplayPreferences()
  // Stat-text colouring (substat chips + rank/rarity & main-stat cells) is on when stat scope ≠ off.
  const colorStatTextsOn = scopeColorsText(statColorScope)
  // Track which rule rows are newly added so they can play an enter animation.
  // Because RecipeID is positional (re-stamped as array index + 1), inserting a recipe
  // shifts all subsequent keys making them look "new".  Suppress enter animation on
  // structural changes (count differs) for the same reason as changedRuleKeys below.
  const prevRuleKeysRef = useRef<ReadonlySet<string>>(new Set())
  // clearGeneration is bumped via setTimeout after the animation window to force
  // the useMemo below to recompute and return an empty set.
  const [clearRuleGeneration, setClearRuleGeneration] = useState(0)
  const clearRuleEnterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Compute new keys synchronously during render by mutating prevRuleKeysRef.
  // This ensures isNewRow is true on the SAME render as the new rules — no frame delay.
  const enteringRuleKeys = useMemo(() => {
    const prev = prevRuleKeysRef.current
    const currentKeys = new Set<string>()
    const newKeys = new Set<string>()
    // Structural change guard: if rule count changed, positional key matching is unreliable —
    // shifted rows would all appear "new".  Update the ref but return no animations.
    const structuralChange = prev.size > 0 && prev.size !== rules.length
    rules.forEach((rule, idx) => {
      const key = computeRuleAnimKey(rule, idx)
      currentKeys.add(key)
      if (!structuralChange && !prev.has(key)) newKeys.add(key)
    })
    // Mutate the ref in render so the next render compares against the latest keys.
    prevRuleKeysRef.current = currentKeys
    return newKeys
    // clearRuleGeneration is included so the memo re-runs when the timer fires —
    // prevRuleKeysRef already matches current rules at that point, so newKeys is empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [rules, clearRuleGeneration])
  useEffect(() => {
    // Schedule clearing the entering set after the animation window elapses.
    if (enteringRuleKeys.size === 0) return // eslint-disable-line react-you-might-not-need-an-effect/no-event-handler -- timer teardown driven by derived memo state, not a user event
    if (clearRuleEnterTimerRef.current !== null) clearTimeout(clearRuleEnterTimerRef.current)
    clearRuleEnterTimerRef.current = setTimeout(
      () => setClearRuleGeneration((g) => g + 1),
      RULE_ROW_ENTER_ANIMATION_MS + 50,
    )
  }, [enteringRuleKeys])

  // Track which existing rule rows changed content so they can pulse.
  // Fingerprint covers all mutable fields visible in the table; __lineIdx is excluded
  // because positional churn (reorder) should not trigger a content-change pulse.
  // NOTE: RecipeID is positional (re-stamped as array index + 1 on every worker run), so
  // fingerprint matching is only reliable when the rule count is the same as before.
  // When rules are inserted or deleted the positions shift and every downstream row would
  // get a false-positive pulse.  Guard against this by suppressing change-pulse whenever
  // the rule count differs from the previous render.
  const prevRuleFingerprintsRef = useRef<Map<string, string>>(new Map())
  const [clearRuleChangeGeneration, setClearRuleChangeGeneration] = useState(0)
  const clearRuleChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const changedRuleKeys = useMemo(() => {
    const prevFp = prevRuleFingerprintsRef.current
    const nextFp = new Map<string, string>()
    const changed = new Set<string>()
    rules.forEach((rule, idx) => {
      const key = computeRuleAnimKey(rule, idx)
      // Compact fingerprint of the fields the user can edit.  Substats are serialised
      // as sorted id:value:flat triples so reordering substats also triggers a pulse.
      const substats = [...(rule.Substats ?? [])].sort((a, b) => a.ID - b.ID)
        .map((s) => `${s.ID}:${s.Value}:${s.IsFlat ? 1 : 0}`).join(',')
      const fp = [
        rule.RecipeName ?? '',
        rule.Keep ? 'k' : 's',
        (rule.ArtifactSet ?? []).slice().sort().join('/'),
        (rule.ArtifactType ?? []).slice().sort().join('/'),
        rule.__rankMask ?? rule.Rank ?? '',
        rule.__rarityMask ?? rule.Rarity ?? '',
        rule.MainStatID ?? '',
        rule.Faction ?? '',
        substats,
      ].join('|')
      nextFp.set(key, fp)
      // Structural change guard: if rule count changed, positional IDs shifted and
      // fingerprint matching would produce false positives on every downstream row.
      // Only record a changed key when the set size is stable (pure content edit).
      if (prevFp.size === rules.length && prevFp.has(key) && prevFp.get(key) !== fp) {
        changed.add(key)
      }
    })
    prevRuleFingerprintsRef.current = nextFp
    return changed
    // clearRuleChangeGeneration forces a recompute after the pulse window so changed is empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [rules, clearRuleChangeGeneration])
  useEffect(() => {
    if (changedRuleKeys.size === 0) return // eslint-disable-line react-you-might-not-need-an-effect/no-event-handler -- timer teardown driven by derived memo state, not a user event
    if (clearRuleChangeTimerRef.current !== null) clearTimeout(clearRuleChangeTimerRef.current)
    clearRuleChangeTimerRef.current = setTimeout(
      () => setClearRuleChangeGeneration((g) => g + 1),
      RULE_ROW_CHANGE_PULSE_MS + 50,
    )
  }, [changedRuleKeys])

  // Single-line mode is strict fixed-height (see `RULES_TABLE_FIXED_ROW_HEIGHT_PX`).
  // Why: fixed-height makes `scrollToIndex` exact even for very large lists without DOM measurement.
  // Wrap mode rows are variable-height; still provide a realistic estimate so `scrollToIndex` lands near the target.
  // Why: the virtualizer must pick an initial offset before it has any measured rows to learn from.
  // Keep the estimate a bit high.
  // Why: under-estimates tend to land short (target still offscreen), while small over-estimates usually self-correct.
  const DEFAULT_WRAP_ROW_ESTIMATE_PX: number = 96
  const emptyLabel = useMemo(() => {
    if (rules.length > 0) return null
    const limitText = new Intl.NumberFormat(undefined).format(RULE_COUNT_LIMIT)
    // Busy indicators now live in the preview header chips, so the preview table
    // only distinguishes between true empties, filter empties, and limit hits.
    return limitExceeded
      ? t('rulesLimitExceeded', { limit: limitText })
      : (emptyDueToFilter ? t('rulesEmptyFiltered') : t('rulesEmpty'))
  }, [rules.length, limitExceeded, t, emptyDueToFilter])
  const showEmptyOverlay = rules.length === 0 && Boolean(emptyLabel)
  // Table container refs power both virtualization and DOM-based hover styling.
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLTableSectionElement | null>(null)
  const [containerW, setContainerW] = useState(0)
  const [showScrollRangeHint, setShowScrollRangeHint] = useState(false)
  // Ref-based setters so scroll/ResizeObserver callbacks avoid the set-state-in-effect lint rule.
  const setContainerWRef = useRef(setContainerW)
  useEffect(() => { setContainerWRef.current = setContainerW }, [setContainerW])
  const setShowScrollRangeHintRef = useRef(setShowScrollRangeHint)
  useEffect(() => { setShowScrollRangeHintRef.current = setShowScrollRangeHint }, [setShowScrollRangeHint])
  const scrollRangeVisibleRef = useRef(false)
  const scrollRangeHideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  // Sticky header height participates in both empty overlays and the "actually visible" viewport math.
  // Why: the table header consumes vertical space that should not count as visible row real estate.
  const [headerHeightPx, setHeaderHeightPx] = useState(0)
  // Ref-based setter so the ResizeObserver callback avoids the set-state-in-effect lint rule.
  const setHeaderHeightPxRef = useRef(setHeaderHeightPx)
  useEffect(() => { setHeaderHeightPxRef.current = setHeaderHeightPx }, [setHeaderHeightPx])
  // Smooth-scroll preview jumps via TanStack's `scrollToFn` hook.
  // Why: calling `scrollToIndex({ behavior: 'smooth' })` alone is not reliable with dynamic-size rows.
  const [wrapRows, setWrapRows] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(RULES_TABLE_WRAP_ROWS_KEY)
      if (raw === 'true') return true
      if (raw === 'false') return false
    } catch {}
    return false
  })
  useEffect(() => {
    try { localStorage.setItem(RULES_TABLE_WRAP_ROWS_KEY, String(wrapRows)) } catch {}
  }, [wrapRows])

  // Render helpers cache derived strings/arrays per rule so repeated renders
  // (e.g. while scrolling or filtering) do not redo the expensive formatting work.
  const sortedArtifactTypesCacheRef = useRef<WeakMap<HsfRuleWithRecipe, readonly number[]>>(new WeakMap())
  const sortedArtifactSetsCacheRef = useRef<WeakMap<HsfRuleWithRecipe, readonly number[]>>(new WeakMap())
  const substatSummaryCacheRef = useRef<WeakMap<HsfRuleWithRecipe, { withButtons?: string; plain?: string; source: HsfRule['Substats'] | undefined }>>(new WeakMap())
  const substatDetailsCacheRef = useRef<WeakMap<HsfRuleWithRecipe, { normalized: readonly RuleSubstatDetail[]; source: HsfRule['Substats'] | undefined }>>(new WeakMap())
  const artifactTypeLabelCacheRef = useRef<WeakMap<HsfRuleWithRecipe, string>>(new WeakMap())
  const artifactSetLabelCacheRef = useRef<WeakMap<HsfRuleWithRecipe, string>>(new WeakMap())
  const rankRarityLabelCacheRef = useRef<WeakMap<HsfRuleWithRecipe, string>>(new WeakMap())
  const factionLabelCacheRef = useRef<WeakMap<HsfRuleWithRecipe, string>>(new WeakMap())

  useEffect(() => {
    artifactTypeLabelCacheRef.current = new WeakMap()
    artifactSetLabelCacheRef.current = new WeakMap()
    rankRarityLabelCacheRef.current = new WeakMap()
    factionLabelCacheRef.current = new WeakMap()
    substatSummaryCacheRef.current = new WeakMap()
  }, [t])

  const getSubstatDetails = useCallback((rule: HsfRuleWithRecipe): readonly RuleSubstatDetail[] => {
    const cache = substatDetailsCacheRef.current
    const source = rule.Substats
    const existing = cache.get(rule)
    if (existing && existing.source === source) return existing.normalized
    const normalized = normalizeRuleSubstats(source)
    cache.set(rule, { normalized, source })
    return normalized
  }, [])

  const getSortedArtifactTypes = useCallback((rule: HsfRuleWithRecipe): readonly number[] => {
    let cached = sortedArtifactTypesCacheRef.current.get(rule)
    if (!cached) {
      const raw = Array.isArray(rule.ArtifactType) ? [...rule.ArtifactType] : []
      raw.sort(compareArtifactTypes)
      cached = raw
      sortedArtifactTypesCacheRef.current.set(rule, cached)
    }
    return cached
  }, [])

  const getSortedArtifactSets = useCallback((rule: HsfRuleWithRecipe): readonly number[] => {
    let cached = sortedArtifactSetsCacheRef.current.get(rule)
    if (!cached) {
      const raw = Array.isArray(rule.ArtifactSet) ? [...rule.ArtifactSet] : []
      raw.sort(compareArtifactSets)
      cached = raw
      sortedArtifactSetsCacheRef.current.set(rule, cached)
    }
    return cached
  }, [])

  const getSubstatSummary = useCallback((rule: HsfRuleWithRecipe): string => {
    let entry = substatSummaryCacheRef.current.get(rule)
    if (!entry) {
      entry = { source: rule.Substats }
      substatSummaryCacheRef.current.set(rule, entry)
    } else if (entry.source !== rule.Substats) {
      delete entry.withButtons
      delete entry.plain
      entry.source = rule.Substats
    }
    const normalized = getSubstatDetails(rule)
    if (colorStatTextsOn) {
      if (entry.withButtons === undefined) {
        entry.withButtons = formatRuleSubstatSummary(rule.Substats, t, { normalized }) || ''
      }
      return entry.withButtons ?? ''
    }
    if (entry.plain === undefined) {
      entry.plain = formatRuleSubstatPlain(rule.Substats, t, { normalized }) || ''
    }
    return entry.plain ?? ''
  }, [colorStatTextsOn, t, getSubstatDetails])

  const getSubstatTooltipSummary = useCallback((rule: HsfRuleWithRecipe): string => {
    let entry = substatSummaryCacheRef.current.get(rule)
    if (!entry) {
      entry = { source: rule.Substats }
      substatSummaryCacheRef.current.set(rule, entry)
    } else if (entry.source !== rule.Substats) {
      delete entry.withButtons
      delete entry.plain
      entry.source = rule.Substats
    }
    const normalized = getSubstatDetails(rule)
    if (entry.withButtons === undefined) {
      entry.withButtons = formatRuleSubstatSummary(rule.Substats, t, { normalized }) || ''
    }
    return entry.withButtons ?? ''
  }, [t, getSubstatDetails])

  const getArtifactTypeLabel = useCallback((rule: HsfRuleWithRecipe): string => {
    let cached = artifactTypeLabelCacheRef.current.get(rule)
    if (cached === undefined) {
      const ids = getSortedArtifactTypes(rule)
      cached = ids.map((id) => t(artifactTypeI18nKey(id))).join(', ')
      artifactTypeLabelCacheRef.current.set(rule, cached)
    }
    return cached
  }, [getSortedArtifactTypes, t])

  const getArtifactSetLabel = useCallback((rule: HsfRuleWithRecipe): string => {
    if (rule.__allKnownSets) return t('setAllKnownShorthand')
    let cached = artifactSetLabelCacheRef.current.get(rule)
    if (cached === undefined) {
      const ids = getSortedArtifactSets(rule)
      cached = ids.map((id) => getLocalizedGearSetName(id, t, lang)).join(', ')
      artifactSetLabelCacheRef.current.set(rule, cached)
    }
    return cached
  }, [getSortedArtifactSets, lang, t])

  const getRankRarityLabel = useCallback((rule: HsfRuleWithRecipe): string => {
    let cached = rankRarityLabelCacheRef.current.get(rule)
    if (cached === undefined) {
      const rank = formatRank(rule.Rank)
      const rc = Number(rule.Rarity)
      const rarity = (() => {
        switch (rc) {
          case 1: return t('rarityCommon')
          case 2: return t('rarityUncommon')
          case 3: return t('rarityRare')
          case 4: return t('rarityEpic')
          case 5: return t('rarityLegendary')
          case 15: return t('rarityMythical')
          case 6: return `≥${NBSP}${t('rarityCommon')}`
          case 7: return `≥${NBSP}${t('rarityUncommon')}`
          case 8: return `≥${NBSP}${t('rarityRare')}`
          case 9: return `≥${NBSP}${t('rarityEpic')}`
          case 16: return `≥${NBSP}${t('rarityLegendary')}`
          case 10: return `≤${NBSP}${t('rarityUncommon')}`
          case 11: return `≤${NBSP}${t('rarityRare')}`
          case 12: return `≤${NBSP}${t('rarityEpic')}`
          case 13: return `≤${NBSP}${t('rarityLegendary')}`
          case 14: return `≤${NBSP}${t('rarityMythical')}`
          default: return rarityCodeToName(rc)
        }
      })()
      cached = [rank, rarity].filter(Boolean).join(NBSP)
      rankRarityLabelCacheRef.current.set(rule, cached)
    }
    return cached
  }, [t])

  const getFactionLabel = useCallback((rule: HsfRuleWithRecipe): string => {
    let cached = factionLabelCacheRef.current.get(rule)
    if (cached === undefined) {
      const fc = Number(rule.Faction)
      cached = fc && fc !== 0 ? t(factionI18nKey(fc as FactionId)) : ''
      factionLabelCacheRef.current.set(rule, cached)
    }
    return cached
  }, [t])
  const resolvePreviewRuleName = useCallback((rule: HsfRuleWithRecipe, isSafeguardRow: boolean): string => {
    // Safeguard injections should always expose their authored label.
    if (isSafeguardRow) return resolveSafeguardRuleLabel(rule) ?? t('safeguardsTabLabel')
    // Resolve recipe names from the live recipe-name snapshot first, then fall back to serialized RecipeName metadata.
    const recipeIdx = resolveDisplayRecipeIdx(rule)
    return resolveMatchRecipeName(recipeIdx, recipeNames, rule) ?? ''
  }, [recipeNames, t])
  const resolvePreviewRuleFgColor = useCallback((rule: HsfRuleWithRecipe, isSafeguardRow: boolean): string => {
    if (isSafeguardRow) return ''
    const recipeIdx = resolveDisplayRecipeIdx(rule)
    if (recipeIdx == null || recipeIdx < 0 || recipeIdx >= recipeFgColors.length) return ''
    return recipeFgColors[recipeIdx] ?? ''
  }, [recipeFgColors])
  const handleSafeguardStarClick = useCallback((rule: HsfRuleWithRecipe) => {
    // Safeguard rows carry a 1-based ordinal for cross-view routing.
    const ruleOrdinal = typeof rule.__safeguardRuleOrdinal === 'number' ? rule.__safeguardRuleOrdinal : null
    // Real safeguard matches carry an item key; placeholder gaps do not.
    const safeguardItemKey = (
      typeof rule.__safeguardItemKey === 'number'
      && Number.isFinite(rule.__safeguardItemKey)
    )
      ? rule.__safeguardItemKey
      : null
    onSelectSafeguardRule?.({
      safeguardRuleOrdinal: ruleOrdinal,
      safeguardItemKey,
      isPlaceholder: rule.__safeguardPlaceholder === true,
    })
  }, [onSelectSafeguardRule])

  type RecipeRuleSpan = { first: number; last: number; count: number }
  const recipeRuleSpanMap = useMemo<Map<number, RecipeRuleSpan>>(() => {
    const spans = new Map<number, RecipeRuleSpan>()
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i] as HsfRuleWithRecipe | undefined
      if (!rule) continue
      // HSF-embedded indices reference a foreign SFC — exclude them so chip selection targets only active SFC rows.
      if (rule.__source === RULE_SOURCE_HSF) continue
      const recipeIdx = resolveDisplayRecipeIdx(rule as HsfRuleWithRecipe)
      if (recipeIdx === null) continue
      const existing = spans.get(recipeIdx)
      if (existing) {
        existing.last = i
        existing.count += 1
      } else {
        spans.set(recipeIdx, { first: i, last: i, count: 1 })
      }
    }
    return spans
  }, [rules])

  const getRecipeSpan = useCallback((recipeIdx: number): RecipeRuleSpan | null => {
    return recipeRuleSpanMap.get(recipeIdx) ?? null
  }, [recipeRuleSpanMap])

  // Parallel span map for safeguard rows — maps 1-based ordinal to the first/last row index.
  // Mirrors recipeRuleSpanMap so the scroll effect can jump to a safeguard block the same way.
  type SafeguardOrdinalSpan = { first: number; last: number }
  const safeguardOrdinalSpanMap = useMemo<Map<number, SafeguardOrdinalSpan>>(() => {
    const spans = new Map<number, SafeguardOrdinalSpan>()
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i] as HsfRuleWithRecipe | undefined
      if (!rule || rule.__source !== RULE_SOURCE_SAFEGUARDS) continue
      const ordinal = rule.__safeguardRuleOrdinal
      if (typeof ordinal !== 'number') continue
      const existing = spans.get(ordinal)
      if (existing) {
        existing.last = i
      } else {
        spans.set(ordinal, { first: i, last: i })
      }
    }
    return spans
  }, [rules])

  // ---------------------------------------------------------------------------
  // Display model: interleave unselectable group-separator rows between groups.
  // ---------------------------------------------------------------------------
  // Separators are a render-only concern: `rules[]`, the worker, merge and all
  // selection/span math stay in *rule index* space. The virtualizer is driven
  // off `displayItems` instead, and we translate rule⇄display indices at the
  // (few) call sites that scroll or report ranges.
  // Separator descriptor is the module-level PreviewGroupSeparator (shared with SeparatorRow).
  type DisplayRule = { kind: 'rule'; ruleIdx: number }
  type DisplayItem = PreviewGroupSeparator | DisplayRule

  // Resolve a per-row group identity. Rows sharing an identity are one group and
  // get a single leading separator. `null` means "no separator" (should not occur
  // for known sources, but keeps the walk total).
  const resolveRowGroupKey = useCallback((rule: HsfRuleWithRecipe): string => {
    // Safeguard rows group by their 1-based ordinal so each authored safeguard is one block.
    if (rule.__source === RULE_SOURCE_SAFEGUARDS) {
      const ordinal = rule.__safeguardRuleOrdinal
      return `sg:${typeof ordinal === 'number' ? ordinal : 'x'}`
    }
    // Final-sell rows are a single catch-all block regardless of count.
    if (rule.__source === RULE_SOURCE_FINAL_SELL) return 'finalSell'
    // SFC recipe rows group by recipe index.
    const recipeIdx = resolveDisplayRecipeIdx(rule)
    if (recipeIdx !== null) return `recipe:${recipeIdx}`
    // Imported base (HSF) rows with no recipe identity fold into one base block.
    return 'base'
  }, [])

  // Build the interleaved display list plus rule⇄display index translation tables.
  const { displayItems, ruleToDisplayIndex } = useMemo(() => {
    const items: DisplayItem[] = []
    // ruleIdx → index into `displayItems` (for scroll targets coming from rule space).
    const ruleToDisplay: number[] = new Array(rules.length)
    let activeGroupKey: string | null = null
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i] as HsfRuleWithRecipe | undefined
      if (!rule) continue
      const groupKey = resolveRowGroupKey(rule)
      // Emit a separator whenever the group identity changes from the previous row.
      if (groupKey !== activeGroupKey) {
        activeGroupKey = groupKey
        // Count how many consecutive rows belong to this group (rules this group emits).
        let count = 0
        for (let j = i; j < rules.length; j += 1) {
          const r = rules[j] as HsfRuleWithRecipe | undefined
          if (!r || resolveRowGroupKey(r) !== groupKey) break
          count += 1
        }
        // Reuse the row's own name/color resolution for the heading.
        const isSafeguardRow = rule.__source === RULE_SOURCE_SAFEGUARDS
        // Recipe identity drives both the glyph/index AND the empty-name fallback below, so
        // resolve it once here (SSOT) rather than recomputing per branch.
        const separatorRecipeIdx = resolveDisplayRecipeIdx(rule)
        let label = resolvePreviewRuleName(rule, isSafeguardRow)
        // Fill in a group label only when the row carries no authored name.
        if (!label) {
          if (rule.__source === RULE_SOURCE_FINAL_SELL) {
            label = t('finalSellToggleLabel')
          } else if (separatorRecipeIdx === null) {
            // Genuine imported base (HSF) rows with no recipe identity — the base label applies.
            label = t('previewGroupSeparatorBaseLabel')
          }
          // An unnamed *recipe* keeps an empty label: the separator shows its index badge with
          // no name, exactly as the recipe chip renders a nameless recipe ("«n». Keep | …").
          // "Imported Base Rules" is reserved for true base rows and must never mislabel a recipe.
        }
        const color = resolvePreviewRuleFgColor(rule, isSafeguardRow)
        // Classify the group for glyph + index display.
        let glyphKind: SeparatorGlyphKind = 'base'
        let indexLabel: number | null = null
        if (isSafeguardRow) {
          glyphKind = 'safeguard'
          // Show the 1-based authored safeguard ordinal.
          indexLabel = typeof rule.__safeguardRuleOrdinal === 'number' ? rule.__safeguardRuleOrdinal : null
        } else if (rule.__source === RULE_SOURCE_FINAL_SELL) {
          glyphKind = 'finalSell'
        } else if (separatorRecipeIdx !== null) {
          glyphKind = 'recipe'
          // resolveDisplayRecipeIdx is 0-based; display the 1-based recipe number.
          indexLabel = separatorRecipeIdx + 1
        }
        items.push({ kind: 'separator', groupKey, glyphKind, indexLabel, label, color, count })
      }
      ruleToDisplay[i] = items.length
      items.push({ kind: 'rule', ruleIdx: i })
    }
    return { displayItems: items, ruleToDisplayIndex: ruleToDisplay }
  }, [rules, resolveRowGroupKey, resolvePreviewRuleName, resolvePreviewRuleFgColor, t])

  // Translate a rule index into its display index (for scrollToIndex targets).
  const displayIndexForRule = useCallback((ruleIdx: number): number => {
    if (ruleIdx < 0 || ruleIdx >= ruleToDisplayIndex.length) return ruleIdx
    const mapped = ruleToDisplayIndex[ruleIdx]
    return typeof mapped === 'number' ? mapped : ruleIdx
  }, [ruleToDisplayIndex])

  // Translate a display index back to the rule index it represents (separators → nearest following rule).
  const ruleIndexForDisplay = useCallback((displayIdx: number): number => {
    const item = displayItems[displayIdx]
    if (item?.kind === 'rule') return item.ruleIdx
    // Separator: report the rule index of the row it precedes (for the visible-range overlay).
    for (let i = displayIdx + 1; i < displayItems.length; i += 1) {
      const next = displayItems[i]
      if (next?.kind === 'rule') return next.ruleIdx
    }
    return Math.max(0, rules.length - 1)
  }, [displayItems, rules.length])

  // Gate hover highlighting to the table area only
  const [isHoveringArea, setIsHoveringArea] = useState(false)
  // DOM-based hover highlight to avoid re-rendering rows during hover. Targets carry a `kind` so the
  // same machinery highlights recipe rows and safeguard rows (and links their respective chips).
  const lastDomHoverTargetRef = useRef<ChipHoverTarget>(null)
  const hoveredRowElsRef = useRef<HTMLElement[] | null>(null)
  const lastPropagatedHoverRef = useRef<ChipHoverTarget>(null)
  const hoverThrottleTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const hoverRafIdRef = useRef<number | null>(null)
  const pendingLocalHoverRef = useRef<ChipHoverTarget>(null)
  const pendingHoverTargetRef = useRef<ChipHoverTarget>(null)
  // Structural equality for hover targets (null-safe); shared by the throttle + rAF coalescers.
  const hoverTargetsEqual = (a: ChipHoverTarget, b: ChipHoverTarget): boolean =>
    a === null || b === null ? a === b : a.kind === b.kind && a.id === b.id
  const selectedRowElsRef = useRef<HTMLElement[] | null>(null)
  const lastSelectedRecipeRef = useRef<number | null>(null)
  const applyDomSelection = useCallback((recipeIdx: number | null) => {
    const container = tableContainerRef.current
    if (!container) {
      lastSelectedRecipeRef.current = recipeIdx
      return
    }
    if (selectedRowElsRef.current) {
      for (const el of selectedRowElsRef.current) {
        try { el.removeAttribute('data-selected-recipe') } catch {}
      }
      selectedRowElsRef.current = null
    }
    lastSelectedRecipeRef.current = recipeIdx
    if (recipeIdx === null || recipeIdx === undefined) return
    const list = Array.from(container.querySelectorAll(`tr[data-recipe-idx="${recipeIdx}"]`)) as HTMLElement[]
    if (!list.length) return
    selectedRowElsRef.current = list
    for (const el of list) {
      try { el.setAttribute('data-selected-recipe', 'true') } catch {}
    }
  }, [])
  // Parallel DOM-level highlight for safeguard rows — mirrors applyDomSelection for recipe rows.
  const selectedSafeguardRowElsRef = useRef<HTMLElement[] | null>(null)
  const lastSelectedSafeguardOrdinalRef = useRef<number | null>(null)
  const applyDomSafeguardSelection = useCallback((ordinal: number | null) => {
    const container = tableContainerRef.current
    if (!container) {
      lastSelectedSafeguardOrdinalRef.current = ordinal
      return
    }
    if (selectedSafeguardRowElsRef.current) {
      for (const el of selectedSafeguardRowElsRef.current) {
        try { el.removeAttribute('data-selected-safeguard') } catch {}
      }
      selectedSafeguardRowElsRef.current = null
    }
    lastSelectedSafeguardOrdinalRef.current = ordinal
    if (ordinal === null || ordinal === undefined) return
    const list = Array.from(container.querySelectorAll(`tr[data-safeguard-ordinal="${ordinal}"]`)) as HTMLElement[]
    if (!list.length) return
    selectedSafeguardRowElsRef.current = list
    for (const el of list) {
      try { el.setAttribute('data-selected-safeguard', 'true') } catch {}
    }
  }, [])
  const scheduleHoverPropagation = (next: ChipHoverTarget) => {
    if (hoverTargetsEqual(lastPropagatedHoverRef.current, next)) {
      return
    }
    if (hoverThrottleTimerRef.current !== null) {
      const previousPending = pendingHoverTargetRef.current
      if (hoverTargetsEqual(previousPending, next)) {
        return
      }
      pendingHoverTargetRef.current = next
      return
    }
    pendingHoverTargetRef.current = next
    // Use a lightweight timeout to coalesce rapid row-enter events before
    // notifying the builder side; this keeps React state updates bounded
    // when users scrub the table quickly.
    hoverThrottleTimerRef.current = window.setTimeout(() => {
      hoverThrottleTimerRef.current = null
      const target = pendingHoverTargetRef.current
      const prevPropagated = lastPropagatedHoverRef.current
      if (hoverTargetsEqual(target, prevPropagated)) {
        lastPropagatedHoverRef.current = target
        pendingHoverTargetRef.current = target
        return
      }
      lastPropagatedHoverRef.current = target
      pendingHoverTargetRef.current = target
      try { onHoverChipTarget(target) } catch {}
    }, RULES_TABLE_HOVER_PROPAGATION_MS)
  }

  // Per-frame throttle for local hover updates (row highlight). Coalesces rapid
  // mouseenter events into a single state update per animation frame.
  const applyDomHover = (target: ChipHoverTarget) => {
    const container = tableContainerRef.current
    if (!container) return
    if (hoveredRowElsRef.current) {
      for (const el of hoveredRowElsRef.current) { try { el.classList.remove('row-hover') } catch {} }
      hoveredRowElsRef.current = null
    }
    lastDomHoverTargetRef.current = target
    if (target === null) {
      return
    }
    // Recipe rows key on data-recipe-idx (0-based); safeguard rows on data-safeguard-ordinal (1-based).
    const selector = target.kind === 'safeguard'
      ? `tr[data-safeguard-ordinal="${target.id + 1}"]`
      : `tr[data-recipe-idx="${target.id}"]`
    const list = Array.from(container.querySelectorAll(selector)) as HTMLElement[]
    for (const el of list) { try { el.classList.add('row-hover') } catch {} }
    hoveredRowElsRef.current = list
  }
  const scheduleLocalHover = (next: ChipHoverTarget) => {
    pendingLocalHoverRef.current = next
    if (hoverRafIdRef.current !== null) {
      return
    }
    // Keep the DOM-highlight work inside rAF so browsers can batch style
    // recalculations with the table virtualization updates.
    hoverRafIdRef.current = requestAnimationFrame(() => {
      hoverRafIdRef.current = null
      const target = pendingLocalHoverRef.current
      if (!hoverTargetsEqual(target, lastDomHoverTargetRef.current)) applyDomHover(target)
      scheduleHoverPropagation(target)
    })
  }
  useEffect(() => () => {
    if (hoverThrottleTimerRef.current) {
      clearTimeout(hoverThrottleTimerRef.current)
      hoverThrottleTimerRef.current = null
    }
    if (hoverRafIdRef.current !== null) {
      try { cancelAnimationFrame(hoverRafIdRef.current) } catch {}
      hoverRafIdRef.current = null
    }
  }, [])

  useEffect(() => {
    applyDomSelection(multiselectActive ? null : selectedRecipeIdx)
  }, [selectedRecipeIdx, multiselectActive, applyDomSelection])

  // Reapply safeguard highlight whenever the selected ordinal changes.
  useEffect(() => {
    applyDomSafeguardSelection(selectedSafeguardOrdinal)
  }, [selectedSafeguardOrdinal, applyDomSafeguardSelection])

  useEffect(() => {
    // Virtualization swaps row elements as the user scrolls; reapply the hover class so
    // newly mounted rows for the active recipe/safeguard keep their highlight without extra renders.
    const hovered = lastDomHoverTargetRef.current
    if (hovered !== null) {
      applyDomHover(hovered)
    }
    // Reapply both recipe and safeguard highlights after every render (virtualization churn).
    applyDomSelection(lastSelectedRecipeRef.current ?? null)
    applyDomSafeguardSelection(lastSelectedSafeguardOrdinalRef.current ?? null)
  })

  // Context menus
  const [headerMenu, setHeaderMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  const [rowMenu, setRowMenu] = useState<null | { open: boolean; x: number; y: number; recipeIdx: number | null; source: RuleSource }>(null)
  const headerMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const rowMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeHeaderMenu = useCallback(() => { setHeaderMenu(null) }, [setHeaderMenu])
  const closeRowMenu = useCallback(() => { setRowMenu(null) }, [setRowMenu])
  // Guard the header menu so outside clicks cannot leave a stuck overlay.
  const { contextMenuGuard: headerMenuGuard } = useContextMenuPaperGuard({
    open: Boolean(headerMenu?.open),
    onClose: closeHeaderMenu,
    menuRef: headerMenuPaperRef,
  })
  // Guard the row menu so outside clicks cannot leave a stuck overlay.
  const { contextMenuGuard: rowMenuGuard } = useContextMenuPaperGuard({
    open: Boolean(rowMenu?.open),
    onClose: closeRowMenu,
    menuRef: rowMenuPaperRef,
  })
  // Header hint — disabled while the header menu is open.
  const headerHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.rulesTableHeader, {
    enabled: !headerMenu?.open,
    text: t('contextMenuHintRulesTableHeader'),
  })
  // Row hint — disabled while the row menu is open.
  const rowHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.rulesTableRows, {
    enabled: !rowMenu?.open,
    text: t('contextMenuHint'),
  })

  // Header drag-to-reorder support
  const dragSrcIdxRef = useRef<number | null>(null)
  const onHeaderDragStart = (srcIdx: number) => { dragSrcIdxRef.current = srcIdx }
  const onHeaderDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const onHeaderDrop = (dstIdx: number) => {
    const srcIdx = dragSrcIdxRef.current
    dragSrcIdxRef.current = null
    if (srcIdx === null || srcIdx === dstIdx) return
    updateColumns(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(srcIdx, 1)
      if (!moved) return prev
      arr.splice(dstIdx, 0, moved)
      return arr
    })
  }

  // Column resize support
  const resizeRef = useRef<{ idx: number; startX: number; startW: number } | null>(null)
  const startResize = (idx: number, clientX: number) => {
    const base = cols[idx]
    if (!base) return
    resizeRef.current = { idx, startX: clientX, startW: Number(base.width) || 40 }
    const onMove = (ev: MouseEvent) => {
      const st = resizeRef.current
      if (!st) return
      const dx = ev.clientX - st.startX
      const nextW = Math.max(40, st.startW + dx)
      updateColumns(prev => prev.map((c, i) => (i === st.idx ? { ...c, width: Math.floor(nextW) } : c)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizeRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Virtualizer keys must be stable across filter/sort toggles so scroll position stays anchored.
  // Why: `__lineIdx` is assigned in `computeMergedRules`, and stays stable even when the view is filtered.
  const getRuleVirtualKey = useCallback((index: number): string => {
    // `index` is a *display* index — keys must be stable per display item across filter/sort toggles.
    const item = displayItems[index]
    // Separator keys are stable per group; rule keys reuse the durable `__lineIdx`.
    const stable = item?.kind === 'separator'
      ? `sep:${item.groupKey}`
      : (() => {
          const ruleIdx = item?.kind === 'rule' ? item.ruleIdx : index
          const rule = rules[ruleIdx]
          const lineIdx = typeof rule?.__lineIdx === 'number' ? rule.__lineIdx : ruleIdx
          return `rule:${lineIdx}`
        })()
    // Include wrap toggle in the key so TanStack does not reuse measured heights across modes.
    // Why: fixed-height mode is intentionally clamped, while wrap mode can grow/shrink per column width.
    return `${wrapRows ? 'wrap' : 'fixed'}:${stable}`
  }, [displayItems, rules, wrapRows])

  const scrollAnimTokenRef = useRef<number | null>(null)
  const scrollToFn = useCallback<VirtualizerOptions<HTMLDivElement, HTMLTableRowElement>['scrollToFn']>((offset, options, instance) => {
    // Custom smooth scroll implementation for TanStack navigation methods (`scrollToIndex`, `scrollToOffset`).
    // Why: we want smooth chip-selection jumps without enabling TanStack's `behavior: 'smooth'` warnings/retries.
    // Keep the duration below TanStack's `scrollToIndex` retry window (10 rAFs ≈ 160ms).
    // Why: TanStack checks that the scroll offset reached its target and logs a warning if it doesn't converge fast enough.
    const durationMs = 120
    const start = (instance.scrollElement as unknown as HTMLElement | null)?.scrollTop ?? 0
    const target = offset + (options.adjustments ?? 0)
    const startTime = performance.now()
    scrollAnimTokenRef.current = startTime

    const easeInOutQuint = (t: number): number => {
      if (t < 0.5) return 16 * t * t * t * t * t
      const shifted = t - 1
      return 1 + 16 * shifted * shifted * shifted * shifted * shifted
    }

    const tick = (now: number) => {
      if (scrollAnimTokenRef.current !== startTime) return
      const elapsed = now - startTime
      const progress = Math.min(1, Math.max(0, elapsed / durationMs))
      const eased = easeInOutQuint(progress)
      const next = start + (target - start) * eased
      elementScroll(next, { behavior: 'auto' }, instance)
      if (progress < 1) requestAnimationFrame(tick)
    }

    void options.behavior
    requestAnimationFrame(tick)
  }, [])
  // Single TanStack virtualizer drives both fixed and wrap modes.
  // Why: This replaces the bespoke prefix-sum windowing logic while preserving the `<Table>` structure.
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns functions incompatible with React Compiler memoization; 'use no memo' above opts this component out of compilation
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    // Virtualize the `displayItems[]` list (rules interleaved with group separators).
    // Why: separators occupy real virtual slots; rule-index math translates via displayIndexForRule.
    count: displayItems.length,
    // Use the preview `<TableContainer>` as the scroll element.
    // Why: scroll must remain confined to the preview panel (not the window).
    getScrollElement: () => tableContainerRef.current,
    // Provide an initial height estimate per row.
    // Why: TanStack needs something to compute offsets before any DOM rows are measured.
    estimateSize: (index) => {
      // Separators are slimmer fixed-height dividers in both modes.
      if (displayItems[index]?.kind === 'separator') return RULES_TABLE_SEPARATOR_ROW_HEIGHT_PX
      return wrapRows ? DEFAULT_WRAP_ROW_ESTIMATE_PX : RULES_TABLE_FIXED_ROW_HEIGHT_PX
    },
    // Render extra rows above/below the viewport.
    // Why: reduces visible pop-in during fast scroll without changing UX-visible range math.
    overscan: RULES_TABLE_OVERSCAN_IDLE,
    // Keep keys stable across filter/sort (and between fixed vs wrap).
    // Why: key stability prevents measurements from attaching to the wrong logical row.
    getItemKey: getRuleVirtualKey,
    scrollToFn,
  })
  // Resolve the "actually visible" row indices (excluding overscan) for UX decisions like chip auto-scroll.
  // Why: overscan exists for perf, but UX should reflect what the user can read in the viewport.
  const getActuallyVisibleIndexRange = useCallback((): { first: number; last: number } | null => {
    // Virtualization + DOM refs both depend on the scroll container being mounted.
    const container = tableContainerRef.current
    if (!container) return null
    if (rules.length === 0) return null
    // Use TanStack's own offset→item lookup instead of scanning overscanned items.
    // Why: it stays consistent with TanStack's internal measurements and alignment rules.
    // The `<thead>` is sticky and visually occupies the top of the scroll container.
    // Why: rows behind it are not readable and should not count as "visible" for the range overlay.
    const scrollTopPx = container.scrollTop
    // Model the readable top as the first pixel below the header.
    // Why: in table layout, the body begins under the header, and as we scroll, rows move under the sticky header.
    const viewportTopPx = Math.max(0, scrollTopPx)
    // Model the readable bottom as the container bottom, minus the header's occupied height.
    // Why: only the remaining vertical space is available for body rows.
    const viewportBottomPx = Math.max(
      viewportTopPx,
      scrollTopPx + Math.max(0, container.clientHeight - headerHeightPx - 1),
    )
    const topItem = rowVirtualizer.getVirtualItemForOffset(viewportTopPx)
    const bottomItem = rowVirtualizer.getVirtualItemForOffset(Math.max(viewportTopPx, viewportBottomPx))
    // TanStack reports *display* indices; translate back to rule indices so the
    // scroll-range overlay keeps counting data rows (not separators).
    if (topItem && bottomItem) {
      const a = ruleIndexForDisplay(topItem.index)
      const b = ruleIndexForDisplay(bottomItem.index)
      return { first: Math.min(a, b), last: Math.max(a, b) }
    }
    // Fallback: use the rendered window when offsets are not resolvable yet (e.g. before first measurement).
    const virtualItems = rowVirtualizer.getVirtualItems()
    if (virtualItems.length === 0) return null
    const firstRule = ruleIndexForDisplay(virtualItems[0]!.index)
    const lastRule = ruleIndexForDisplay(virtualItems[virtualItems.length - 1]!.index)
    return { first: Math.min(firstRule, lastRule), last: Math.max(firstRule, lastRule) }
  }, [headerHeightPx, rowVirtualizer, rules.length, ruleIndexForDisplay])
	  // Scroll an index into view (anchored to the top of the tbody rows).
	  // Why: the sticky header is in-flow, so TanStack already lands body rows beneath it without extra alignment.
	  const scrollRuleIndexToTop = useCallback((ruleIndex: number) => {
	    if (ruleIndex < 0 || ruleIndex >= rules.length) return
	    // Translate the rule index to its display index so the leading group separator is accounted for.
	    const displayIndex = displayIndexForRule(ruleIndex)
	    // Anchor on the group separator when present so its heading stays visible above the first row.
	    const target = displayItems[displayIndex - 1]?.kind === 'separator' ? displayIndex - 1 : displayIndex
	    // Use TanStack's own index-based scrolling, but render it smoothly via our `scrollToFn`.
	    // Why: TanStack can recompute offsets as measurements arrive, which is critical for long jumps in wrap mode.
	    rowVirtualizer.scrollToIndex(target, { align: 'start', behavior: 'auto' })
	  }, [rowVirtualizer, rules.length, displayIndexForRule, displayItems])

  const clampRuleIndex = useCallback((index: number | null | undefined) => {
    if (typeof index !== 'number' || !Number.isFinite(index) || rules.length === 0) return null
    return Math.max(0, Math.min(rules.length - 1, Math.floor(index)))
  }, [rules.length])

  // External request to focus a specific rule
  useEffect(() => {
    if (focusRuleIndex == null) return
    // Clamp in case callers pass stale indices after filtering.
    // Why: focus requests come from other panels and should never crash scrolling.
    const clamped = clampRuleIndex(focusRuleIndex)
    if (clamped == null) return
    requestAnimationFrame(() => {
      // Defer to the next frame so the scroll container is mounted and measurable.
      // Why: focus requests can arrive during transitions while React is still committing DOM.
      scrollRuleIndexToTop(clamped)
      onFocusRuleSettled?.()
    })
	  }, [focusRuleIndex, clampRuleIndex, onFocusRuleSettled, scrollRuleIndexToTop])

  // When selection changes (e.g., user clicked a recipe chip), scroll to the start of that recipe’s preview block.
  // Why: per request, rely on TanStack’s built-in scrolling rather than custom "fits/above" heuristics.
  const suppressNextScrollRef = useRef<boolean>(false)
  // Track the last handled scroll request so re-renders do not retrigger scrolling.
  // Why: rules updates can rebuild span maps without user intent.
  // Seed the ref with the current token so mount does not auto-scroll.
  // Why: only explicit requests should move the preview viewport.
  const lastSelectionScrollTokenRef = useRef<number>(selectionScrollRequest.token)
  // Holds a safeguard scroll request that arrived before the span map was populated.
  // Why: the pipeline is debounced ~200ms; a scroll request emitted on restore or chip
  // click may arrive while safeguardOrdinalSpanMap is still empty. Storing the target
  // here lets a separate effect retry the scroll once the map is ready, independent of
  // whether selectionScrollRequest has since changed.
  const pendingScrollRef = useRef<{ ordinal: number } | null>(null)
  useEffect(() => {
    // Gate auto-scroll to explicit scroll requests only.
    // Why: background updates should not move the user's viewport.
    const { token, source, targetRecipeIdx, targetSafeguardOrdinal } = selectionScrollRequest
    if (token === lastSelectionScrollTokenRef.current) return
    lastSelectionScrollTokenRef.current = token
    // Skip recipe-based scroll when a rule-specific focus is active.
    // Why: selectRule already scrolls to the target row.
    if (source === SELECTION_SCROLL_SOURCE_SELECT_RULE && focusRuleIndex != null) return
    // If selection came from a table row click, skip this one automatic scroll.
    if (suppressNextScrollRef.current) { suppressNextScrollRef.current = false; return }
    // Safeguard chip selection: scroll to the first row of the target safeguard block.
    if (targetSafeguardOrdinal != null) {
      const span = safeguardOrdinalSpanMap.get(targetSafeguardOrdinal)
      if (span) {
        // Span available immediately — scroll now and clear any stale pending target.
        pendingScrollRef.current = null
        scrollRuleIndexToTop(span.first)
      } else {
        // Span map not yet populated (pipeline still running). Store the target so the
        // resolution effect below can retry when safeguardOrdinalSpanMap updates.
        pendingScrollRef.current = { ordinal: targetSafeguardOrdinal }
      }
      return
    }
    // A new non-safeguard request cancels any pending safeguard scroll.
    pendingScrollRef.current = null
    // Recipe chip selection: prefer the explicit target, fall back to the current selection.
    const effectiveRecipeIdx = targetRecipeIdx ?? selectedRecipeIdx
    if (effectiveRecipeIdx === null || effectiveRecipeIdx === undefined) return
    if (multiselectActive) return
    // Map the selected recipe to its contiguous range of preview rows.
    // Why: a recipe can generate multiple rules (or none), and the preview must jump to the correct block.
    const span = getRecipeSpan(effectiveRecipeIdx as number)
    if (!span) return
    // Always anchor to the first rule row.
    // Why: this is deterministic and avoids any extra "correction" scrolling logic.
    scrollRuleIndexToTop(span.first)
  }, [
    focusRuleIndex,
    getRecipeSpan,
    multiselectActive,
    safeguardOrdinalSpanMap,
    scrollRuleIndexToTop,
    selectedRecipeIdx,
    selectionScrollRequest,
  ])
  // Resolve a pending safeguard scroll once the span map is populated.
  // Why: the selectionScrollRequest effect stores a pending target when the span map is
  // empty at request time; this effect retries on every safeguardOrdinalSpanMap update
  // until the span appears, then clears the target.
  useEffect(() => {
    const pending = pendingScrollRef.current
    if (!pending) return
    const span = safeguardOrdinalSpanMap.get(pending.ordinal)
    if (!span) return
    pendingScrollRef.current = null
    scrollRuleIndexToTop(span.first)
  }, [safeguardOrdinalSpanMap, scrollRuleIndexToTop])

  useEffect(() => {
    const el = tableContainerRef.current
    if (!el) return
    const onScroll = () => {
      if (!scrollRangeVisibleRef.current) {
        scrollRangeVisibleRef.current = true
        setShowScrollRangeHintRef.current(true)
      }
      if (scrollRangeHideTimerRef.current) {
        clearTimeout(scrollRangeHideTimerRef.current)
        scrollRangeHideTimerRef.current = null
      }
      scrollRangeHideTimerRef.current = window.setTimeout(() => {
        scrollRangeVisibleRef.current = false
        setShowScrollRangeHintRef.current(false)
        scrollRangeHideTimerRef.current = null
      }, RULES_TABLE_SCROLL_HINT_HIDE_MS)
    }
    const measure = () => {
      setContainerWRef.current(el.clientWidth)
    }
    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(el)
    }
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      if (ro) ro.disconnect()
      if (scrollRangeHideTimerRef.current) { clearTimeout(scrollRangeHideTimerRef.current); scrollRangeHideTimerRef.current = null }
    }
  }, [])

  // Row renderer (memoized) to avoid re-computing heavy cells on unrelated updates (e.g., hover elsewhere)
  // (Per-row React.memo was explored but replaced with a DOM-based highlight
  // to avoid re-render cost entirely during hover.)


  type ColKey = keyof HsfRule | 'Idx' | 'RecipeIdx' | 'RuleName' | 'SubstatsSummary' | 'ArtifactTypeNames' | 'ArtifactSetNames' | 'MainStatName' | 'LevelLabel' | 'RankRarity'
  type ColMode = 'auto' | 'show' | 'hide'
  type ColConfig = { key: ColKey; label: string; width: number; visible: boolean; mode?: ColMode }
  const colHeaderLabel = (key: ColKey): string => (
    // Keep existing i18n keys for backwards compatibility with runtime catalogs.
    key === 'Idx' ? t('colIdx') :
    key === 'RecipeIdx' ? t('colRecipe') :
    key === 'RuleName' ? t('colName') :
    key === 'Keep' ? t('colKeep') :
    key === 'Use' ? t('colUse') :
    key === 'ArtifactSetNames' ? t('colSets') :
    key === 'ArtifactTypeNames' ? t('colSlot') :
    key === 'RankRarity' ? t('colRankRarity') :
    key === 'MainStatName' ? t('colMain') :
    key === 'LevelLabel' ? t('colLevel') :
    key === 'Faction' ? t('colFaction') :
    key === 'SubstatsSummary' ? t('colSub') : String(key)
  )
  const colMenuLabel = (key: ColKey): string => (
    key === 'Idx' ? t('colIdxMenu') :
    key === 'RecipeIdx' ? t('colRecipeIdxMenu') :
    // Name stays concise in the table and in the context menu.
    key === 'RuleName' ? t('colName') :
    colHeaderLabel(key)
  )
  const defaultCols = useMemo<ColConfig[]>(() => ([
    { key: 'Idx', label: '#', width: 72, visible: true },
    { key: 'RecipeIdx', label: 'Recipe', width: 64, visible: true },
    // Rule names are useful for audits but too wide for default dense preview layouts.
    { key: 'RuleName', label: 'Name', width: 180, visible: false },
    { key: 'Keep', label: 'Keep', width: 61, visible: false },
    { key: 'Use', label: 'Use', width: 50, visible: false },
    { key: 'ArtifactSetNames', label: 'Sets', width: 140, visible: true },
    { key: 'ArtifactTypeNames', label: 'Slot', width: 90, visible: true },
    { key: 'RankRarity', label: 'Rank/Rarity', width: 160, visible: true },
    { key: 'MainStatName', label: 'Main', width: 75, visible: true },
    { key: 'LevelLabel', label: 'Level', width: 78, visible: true },
    // Default to hidden; users can opt-in via the header menu or auto mode.
    { key: 'Faction', label: 'Faction', width: 50, visible: false, mode: 'auto' },
    { key: 'SubstatsSummary', label: 'Sub', width: 340, visible: true },
  ]), [])
  const [storedCols, setStoredCols] = useRulesTableColumnsPreference()

  const restoreColumns = useCallback((prefs: StoredColumnConfig[]): ColConfig[] => {
    const map = new Map<string, ColConfig>()
    for (const d of defaultCols) map.set(String(d.key), d)
    const restored: ColConfig[] = []
    for (const pref of prefs) {
      const key = pref.key as ColKey | undefined
      const base = key ? map.get(String(key)) : undefined
      if (!base) continue
      const width = Number(pref.width ?? base.width) || base.width
      const visible = typeof pref.visible === 'boolean' ? pref.visible : base.visible
      const modeMaybe = pref.mode === 'auto' || pref.mode === 'show' || pref.mode === 'hide' ? pref.mode : base.mode
      const next: ColConfig = { ...base, width, visible, ...(modeMaybe !== undefined ? { mode: modeMaybe } : {}) }
      restored.push(next)
    }
    for (const d of defaultCols) if (!restored.find(x => x.key === d.key)) restored.push(d)
    const idxRR = restored.findIndex(c => c.key === 'RankRarity')
    const idxMain = restored.findIndex(c => c.key === 'MainStatName')
    if (idxRR !== -1 && idxMain !== -1 && idxRR > idxMain) {
      const rr = restored.splice(idxRR, 1)[0]!
      restored.splice(idxMain, 0, rr)
    }
    return restored
  }, [defaultCols])

  const columnsEqual = useCallback((a: ColConfig[], b: ColConfig[]) => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      const left = a[i]!
      const right = b[i]!
      if (left.key !== right.key) return false
      if (left.width !== right.width) return false
      if (Boolean(left.visible) !== Boolean(right.visible)) return false
      if ((left.mode ?? 'auto') !== (right.mode ?? 'auto')) return false
    }
    return true
  }, [])

  const toStoredColumns = useCallback((colsInput: ColConfig[]): StoredColumnConfig[] => (
    colsInput.map(({ key, label, width, visible, mode }) => ({
      key: String(key),
      label,
      width,
      visible,
      ...(mode ? { mode } : {}),
    }))
  ), [])

  const cols = useMemo(() => restoreColumns(storedCols), [restoreColumns, storedCols])

  const updateColumns = useCallback((updater: (prev: ColConfig[]) => ColConfig[]) => {
    setStoredCols((prevPrefs) => {
      const prevCols = restoreColumns(prevPrefs)
      const nextCols = updater(prevCols)
      if (columnsEqual(prevCols, nextCols)) return prevPrefs
      return toStoredColumns(nextCols)
    })
  }, [columnsEqual, restoreColumns, setStoredCols, toStoredColumns])

  const updateFactionColumnMode = React.useCallback((columnIndex: number, currentMode: ColMode) => {
    const nextMode: ColMode = currentMode === 'auto' ? 'show' : (currentMode === 'show' ? 'hide' : 'auto')
    updateColumns(prev => prev.map((col, i) => (i === columnIndex ? { ...col, mode: nextMode } : col)))
  }, [updateColumns])
  // Show the Faction column automatically when any rule (from SFC or loaded HSF)
  // has a non-zero faction filter. Previously this only reacted to SFC-built rows
  // (those carrying RecipeID), which hid the column for loaded HSF files.
  const anyWithFaction = useMemo(() => rules.some((r) => r && typeof r.Faction === 'number' && (r.Faction as number) !== 0), [rules])
  const isColVisible = React.useCallback((c: ColConfig) => {
    if (c.key === 'Faction') {
      const m = c.mode ?? 'auto'
      if (m === 'show') return true
      if (m === 'hide') return false
      return anyWithFaction
    }
    return c.visible
  }, [anyWithFaction])

  

  // Visible columns (memoized): used for header, width calc, and rows
  const visibleColsForContainer = useMemo(() => cols.filter(c => isColVisible(c)), [cols, isColVisible])

  // Mount-only ResizeObserver for header height; re-measurement triggered by ResizeObserver or resize event.
  useLayoutEffect(() => {
    const node = headerRef.current
    if (!node) {
      setHeaderHeightPxRef.current(0)
      return
    }
    const measure = () => {
      // Prefer integer layout metrics to avoid 1px oscillations from fractional `getBoundingClientRect` heights.
      // Why: the header height feeds TanStack scroll padding/margins, so subpixel drift creates visible jitter.
      const next = Math.max(0, Math.round(node.offsetHeight || node.getBoundingClientRect().height || 0))
      setHeaderHeightPxRef.current(prev => (prev === next ? prev : next))
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(node)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  // Compute whether horizontal scroll is needed to avoid column width jitter
  const totalVisibleWidth = visibleColsForContainer.reduce((sum, c) => sum + (c.width || 0), 0)
  // Add small hysteresis to avoid rapid flip-flopping when widths are near the container boundary.
  // This stabilizes layout (and the visible range math) to reduce the X–Y indicator flicker.
  // Render-time state adjustment: recompute needHScroll when inputs change.
  const [needHScroll, setNeedHScroll] = useState(false)
  const [prevHScrollInputs, setPrevHScrollInputs] = useState({ totalVisibleWidth, containerW })
  if (totalVisibleWidth !== prevHScrollInputs.totalVisibleWidth || containerW !== prevHScrollInputs.containerW) {
    setPrevHScrollInputs({ totalVisibleWidth, containerW })
    if (containerW <= 0) {
      if (needHScroll) setNeedHScroll(false)
    } else {
      const ON_MARGIN = 8   // require a bit of extra overflow to turn on
      const OFF_MARGIN = 8  // require a bit of extra slack to turn off
      const next = !needHScroll
        ? totalVisibleWidth > (containerW + ON_MARGIN)
        : !(totalVisibleWidth < (containerW - OFF_MARGIN))
      if (next !== needHScroll) setNeedHScroll(next)
    }
  }

  // scrollRangeOverlay is populated as a side-effect inside tableBodyContent computation.
  // Why: the scroll range is only known after the virtual items and visibility range are resolved.
  let scrollRangeOverlay: { start: number; end: number; total: number } | null = null

  // Compute the virtual table body rows before the JSX return to avoid IIFEs inside JSX.
  // Why: the large block of virtualization logic is extracted here so it runs as plain JS,
  // then referenced as {tableBodyContent} inside <TableBody>.
  const tableBodyContent = (() => {
    scrollRangeOverlay = null
    const visibleCols = visibleColsForContainer
    const colSpan = Math.max(1, visibleCols.length)
    // Empty overlay handles the messaging; no rows render when empty.
    if (rules.length === 0) return null
    const spacerSx = { p: 0, border: 0, height: 0 }
    // Render only the virtual window plus spacer rows above/below.
    // Why: `<tbody>` must still add up to the full scroll height even though we only mount a subset of rows.
    const virtualItems = rowVirtualizer.getVirtualItems()
    // TanStack may return an empty list briefly during mount.
    // Why: the scroll element ref can be null for a render while React is committing.
    if (virtualItems.length === 0) return null
    // Total virtual height of all rows (measured + estimated).
    // Why: needed to compute the bottom spacer size.
    const totalHeight = Math.max(rowVirtualizer.getTotalSize(), 0)
    // The `<thead>` is in-flow and not part of the virtualized height math.
    // Why: TanStack offsets already model only the `<tbody>` row stack.
    // Spacer above the first mounted virtual item.
    // Why: keeps the first rendered row aligned to its real scroll offset.
    const padTop = Math.max(0, Math.round(virtualItems[0]!.start))
    // Spacer below the last mounted virtual item.
    // Why: keeps the scrollbar thumb size/position consistent.
    const padBottom = Math.max(0, Math.round(totalHeight - virtualItems[virtualItems.length - 1]!.end))
    // Compute the range hint based on "actually visible" rows, not overscan.
    // Why: the overlay should reflect what the user can read, not what we pre-rendered.
    const visibleRange = getActuallyVisibleIndexRange()
    // visibleRange is already in rule space; translate the virtualItem fallbacks too.
    const firstVisibleIndex = visibleRange?.first ?? ruleIndexForDisplay(virtualItems[0]!.index)
    const lastVisibleIndex = visibleRange?.last ?? ruleIndexForDisplay(virtualItems[virtualItems.length - 1]!.index)
    // Populate the scroll-range overlay before returning JSX.
    // Why: the overlay box is rendered outside the table body and reads this value.
    scrollRangeOverlay = {
      start: Math.min(firstVisibleIndex, lastVisibleIndex) + 1,
      end: Math.max(firstVisibleIndex, lastVisibleIndex) + 1,
      total: rules.length,
    }
    return (
      <>
        {padTop > 0 && (
          <TableRow key="spacer-top" sx={{ height: padTop }}>
            <TableCell colSpan={colSpan} sx={spacerSx} />
          </TableRow>
        )}
        {virtualItems.map((virtualItem) => {
          // `virtualItem.index` indexes `displayItems` (rules interleaved with separators).
          const displayIdx = virtualItem.index
          const displayItem = displayItems[displayIdx]
          if (!displayItem) return null
          // Group-separator rows: unselectable, no index column, glyph + index + name + count.
          if (displayItem.kind === 'separator') {
            return (
              <SeparatorRow
                key={virtualItem.key}
                separator={displayItem}
                colSpan={colSpan}
                surfacePaper={previewSurfacePaper}
                wrapRows={wrapRows}
                measureElement={rowVirtualizer.measureElement}
                dataIndex={displayIdx}
                t={t}
              />
            )
          }
          // Rule rows: map the display index back to the rule index, then render as before.
          const idx = displayItem.ruleIdx
          const rule = rules[idx] as HsfRuleWithRecipe | undefined
          if (!rule) return null
          const recipeIdxNumber = resolveDisplayRecipeIdx(rule as HsfRuleWithRecipe)
          const lineIdx = typeof rule.__lineIdx === 'number' ? rule.__lineIdx : idx
          // Normalize rule source so keep-override injections can be recognized reliably.
          const isKnownSource = (
            rule.__source === RULE_SOURCE_HSF
            || rule.__source === RULE_SOURCE_SFC
            || rule.__source === RULE_SOURCE_FINAL_SELL
            || rule.__source === RULE_SOURCE_SAFEGUARDS
          )
          // Cast is safe: isKnownSource guarantees __source is one of the four known RuleSource values.
          const resolvedSource: RuleSource = isKnownSource
            ? (rule.__source as RuleSource)
            : recipeIdxNumber !== null ? RULE_SOURCE_SFC : RULE_SOURCE_HSF
          // Keep overrides include safeguards injection rows.
          const isKeepOverrideSource = resolvedSource === RULE_SOURCE_SAFEGUARDS
          const previewRuleName = resolvePreviewRuleName(rule, isKeepOverrideSource)
          // Color comes from the recipe's appearance.fgColor; empty string when absent.
          const previewRuleColor = resolvePreviewRuleFgColor(rule, isKeepOverrideSource)
          // Table-cell color is contrast-adjusted for the surface bg; tooltip color stays raw
          // (tooltip has an inverted dark bg in light theme where contrast is not the same concern).
          const tablePreviewRuleColor = previewRuleColor
            ? ensureContrastOnBg(previewRuleColor, previewSurfacePaper)
            : ''
          // Determine whether this row should play the enter or change-pulse animation.
          const ruleKey = computeRuleAnimKey(rule, idx)
          const isNewRow = enteringRuleKeys.has(ruleKey)
          // Content-change pulse only fires for rows that already existed (not new arrivals).
          const isChangedRow = !isNewRow && changedRuleKeys.has(ruleKey)
          return (
            <TableRow
              key={virtualItem.key}
              hover
              // TanStack's `measureElement` requires `data-index` to equal the *display* index so it can map DOM nodes back to items.
              // Why: without it, measurements are ignored and scroll offsets drift.
              data-index={displayIdx}
              data-row-index={idx}
              data-rule-source={resolvedSource}
              {...(recipeIdxNumber !== null && resolvedSource !== RULE_SOURCE_HSF ? { 'data-recipe-idx': String(recipeIdxNumber) } : {})}
              // Stamp the 1-based safeguard ordinal so applyDomSafeguardSelection can query it.
              {...(resolvedSource === RULE_SOURCE_SAFEGUARDS && typeof rule.__safeguardRuleOrdinal === 'number' ? { 'data-safeguard-ordinal': String(rule.__safeguardRuleOrdinal) } : {})}
              // Wrap mode needs measured heights so TanStack can compute correct scroll offsets.
              // Why: single-line mode is strict fixed-height, so measuring would unnecessarily enable dynamic mode.
              ref={(el) => {
                if (!el) return
                if (!wrapRows) return
                rowVirtualizer.measureElement(el)
              }}
              onMouseEnter={() => {
                if (!isHoveringArea) return
                // HSF-embedded indices reference a foreign SFC, so hovering should not highlight active recipes.
                if (resolvedSource === RULE_SOURCE_HSF) return
                // Resolve the row's source chip: safeguard rows link their safeguard chip (ordinal→0-based
                // id), everything else links its recipe chip. Rows with neither emit null (no link).
                const next: ChipHoverTarget =
                  resolvedSource === RULE_SOURCE_SAFEGUARDS && typeof rule.__safeguardRuleOrdinal === 'number'
                    ? { kind: 'safeguard', id: rule.__safeguardRuleOrdinal - 1 }
                    : recipeIdxNumber !== null
                      ? { kind: 'recipe', id: recipeIdxNumber }
                      : null
                scheduleLocalHover(next)
              }}
              // Do not clear on row leave; container onMouseLeave clears once.
              onClick={() => {
                // HSF-embedded indices reference a foreign SFC; clicking must not navigate to active recipes.
                if (resolvedSource === RULE_SOURCE_HSF) return
                // Whole-row activation: route the clicked row to its source recipe or safeguard.
                // App switches the builder view mode to match, selects the source, and scrolls it into view.
                // Both recipe rows (recipeIdxNumber !== null) and safeguard rows (RULE_SOURCE_SAFEGUARDS)
                // qualify; App resolves which from the rule's provenance. When wired, this supersedes the
                // legacy recipe-only onSelectRecipeIdx path so scroll-to is no longer suppressed.
                if (onActivateRuleRow) {
                  onActivateRuleRow(rule)
                  return
                }
                if (recipeIdxNumber !== null) {
                  // Fallback (no whole-row handler): keep-override rows surface in the preview but do not map
                  // to chips, so only real recipes trigger selection + auto-scroll.
                  suppressNextScrollRef.current = true
                  onSelectRecipeIdx(recipeIdxNumber)
                }
              }}
              onContextMenu={(e) => {
                // Keep-override preview rows are informational only (no builder actions).
                // Avoid opening a menu at all so we do not surface an empty context menu.
                if (isKeepOverrideSource) return
                try {
                  e.preventDefault()
                  e.stopPropagation()
                } catch {}
                rowHint.onOpen()
                closeHeaderMenu()
                setRowMenu({
                  open: true,
                  x: e.clientX,
                  y: e.clientY,
                  recipeIdx: recipeIdxNumber,
                  source: resolvedSource,
                })
              }}
              onMouseMove={(e) => {
                // Keep-override rows do not expose a context menu, so skip the hint affordance.
                if (isKeepOverrideSource) return
                headerHint.triggerProps.onMouseLeave()
                rowHint.triggerProps.onMouseMove(e)
              }}
              sx={(theme) => ({
                // Fixed-height styling is applied at the `<Table>` level so spacer rows can keep variable heights.
                '&[data-selected-recipe="true"]': {
                  backgroundColor: (theme.vars?.palette.action.selected ?? theme.palette.action.selected),
                },
                // Safeguard row highlight mirrors the recipe selection style.
                '&[data-selected-safeguard="true"]': {
                  backgroundColor: (theme.vars?.palette.action.selected ?? theme.palette.action.selected),
                },
                // Play enter animation for new rows, change-pulse for modified existing rows.
                ...(isNewRow ? {
                  animation: `${RULE_ROW_ENTER_KEYFRAMES} ${RULE_ROW_ENTER_ANIMATION_MS}ms ease-out 1`,
                } : isChangedRow ? {
                  '--rule-row-change-bg': TINT.warningFlashBg,
                  animation: `${RULE_ROW_CHANGE_PULSE_KEYFRAMES} ${RULE_ROW_CHANGE_PULSE_MS}ms ease-out 1`,
                } : {}),
              })}
            >
            {visibleCols.map((c) => {
              let value: string = ''
              let factionLabel: string | null = null
              let recipeSpecialContent: React.ReactNode | null = null
              if (c.key === 'SubstatsSummary') value = getSubstatSummary(rule)
              else if (c.key === 'RecipeIdx') {
                if (recipeIdxNumber !== null) {
                  value = String(recipeIdxNumber + 1)
                } else if (isKeepOverrideSource) {
                  // Keep-override injections display a hollow star and surface the originating rule name for attribution.
                  recipeSpecialContent = (
                    <MarkdownTooltip markdown={previewRuleName}>
                      <ButtonBase
                        // Star clicks branch into Gear Inspector or Safeguards editing based on row metadata.
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleSafeguardStarClick(rule)
                        }}
                        data-safeguard-star="true"
                        sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', borderRadius: 0 }}
                        aria-label={previewRuleName}
                      >
                        <StarBorderIcon fontSize="inherit" />
                      </ButtonBase>
                    </MarkdownTooltip>
                  )
                } else {
                  value = ''
                }
              }
              else if (c.key === 'RuleName') value = previewRuleName
              else if (c.key === 'Keep') value = rule.Keep ? t('keepValueKeep') : t('keepValueSell')
              else if (c.key === 'Use') value = rule.Use ? '✓' : '-'
              else if (c.key === 'ArtifactTypeNames') {
                value = getArtifactTypeLabel(rule)
              }
              else if (c.key === 'ArtifactSetNames') {
                value = getArtifactSetLabel(rule)
              }
              else if (c.key === 'RankRarity') {
                value = getRankRarityLabel(rule)
              }
              else if (c.key === 'Faction') {
                const label = getFactionLabel(rule)
                factionLabel = label
                value = showFactionIcons ? '' : label
              }
              else if (c.key === 'MainStatName') {
                // When main stat is Any (MainStatID === -1 or undefined), render nothing.
                // This matches the intended preview behavior post‑i18n.
                const isAnyMain = (rule.MainStatID === undefined || rule.MainStatID === null || Number(rule.MainStatID) === -1)
                value = isAnyMain ? '' : t(statVariantI18nKey(mainToVariant(rule.MainStatID, rule.MainStatF)))
              }
              else if (c.key === 'LevelLabel') value = formatLevel(rule.LVLForCheck)
              else if (c.key === 'Idx') value = String(lineIdx + 1)
              else value = ''
              const isSub = c.key === 'SubstatsSummary'
              const isIdx = c.key === 'Idx'
              // HSF-embedded recipe indices reference a foreign SFC — render them italic with a default cursor.
              const isHsfRecipeIdx = c.key === 'RecipeIdx' && resolvedSource === RULE_SOURCE_HSF && recipeIdxNumber !== null
              const keep = Boolean(rule.Keep)
              // Dim disabled rules instead of applying a strikethrough.
              const isRuleDisabled = rule.Use === false
              // Convert the disabled flag into a per-row opacity for reuse.
              const rowOpacity = isRuleDisabled ? disabledOpacity : 1
              const showRecipeIdxNameTooltip = (
                c.key === 'RecipeIdx'
                && recipeIdxNumber !== null
                && previewRuleName.length > 0
              )
              let content: React.ReactNode = isSub
                ? (
                  <RuleSubstatChips
                    substats={rule.Substats}
                    substatColors={substatColors}
                    wrap={wrapRows}
                    colorize={colorStatTextsOn}
                    normalized={getSubstatDetails(rule)}
                  />
                )
                // Tint the rarity word (Rank·Rarity) and main-stat name (MainStatName) via the shared
                // inline colorizer — it colours stat words and rarity words from the same maps.
                : ((c.key === 'RankRarity' || c.key === 'MainStatName') && value)
                  ? renderColoredStatText((token) => t(token), value, substatColors, colorStatTextsOn, undefined, rarityLabelColors)
                  : (value || '')
              if (c.key === 'RecipeIdx' && recipeSpecialContent) {
                content = recipeSpecialContent
              }
              // Replace textual slots with icons when enabled
              if (c.key === 'ArtifactTypeNames' && showSlotIcons) {
                const types = getSortedArtifactTypes(rule)
                const tooltipTitle = getArtifactTypeLabel(rule)
                // Compute the slot icon list before embedding in JSX to avoid an IIFE inside JSX.
                let slotIconsContent: React.ReactNode
                if (wrapRows) {
                  slotIconsContent = types.map((typeId) => {
                    // Delegate to the module-level SlotIconCell component to avoid creating
                    // a component during render (eslint-react/static-components).
                    // SlotIconCell returns null when no icon exists; fall back to a text label.
                    const hasIcon = artifactTypeIconFor(typeId) !== null
                    return hasIcon
                      ? <SlotIconCell key={`slot-${typeId}`} typeId={typeId} />
                      : <Box key={`slot-${typeId}`} component="span" sx={{ mr: 0.5 }}>{t(artifactTypeI18nKey(typeId))}</Box>
                  })
                } else {
                  // Single-line mode: render only icons that fit, reserve space for an ellipsis if truncated
                  const PAD_X = 12
                  const GAP_PX = 4
                  const SLOT_ICON_PX = 16
                  const unit = SLOT_ICON_PX + GAP_PX
                  const avail = Math.max(0, (c.width || 0) - PAD_X)
                  const capacity = Math.max(0, Math.floor(avail / unit))
                  const needsEllipsis = types.length > capacity
                  const visibleCount = needsEllipsis ? Math.max(0, capacity - 1) : Math.min(types.length, capacity)
                  const vis = types.slice(0, visibleCount)
                  const overflow = Math.max(0, types.length - visibleCount)
                  slotIconsContent = (
                    <>
                      {vis.map((typeId) => {
                        // Same delegation pattern as the wrapRows branch above.
                        const hasIcon = artifactTypeIconFor(typeId) !== null
                        return hasIcon
                          ? <SlotIconCell key={`slot-${typeId}`} typeId={typeId} />
                          : <Box key={`slot-${typeId}`} component="span" sx={{ mr: 0.5 }}>{t(artifactTypeI18nKey(typeId))}</Box>
                      })}
                      {overflow > 0 ? <Box component="span" sx={{ ml: 0.25 }}>…</Box> : null}
                    </>
                  )
                }
                content = (
                  <MarkdownTooltip markdown={tooltipTitle}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: wrapRows ? 'wrap' : 'nowrap', maxWidth: '100%', overflow: wrapRows ? 'visible' : 'hidden', whiteSpace: wrapRows ? 'normal' : 'nowrap' }}>
                      {slotIconsContent}
                    </Box>
                  </MarkdownTooltip>
                )
              }
              if (c.key === 'Faction' && showFactionIcons) {
                const fc = Number(rule.Faction)
                if (fc && fc !== 0 && factionLabel) {
                  content = (
                    <MarkdownTooltip markdown={factionLabel}>
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 0,
                          width: '100%',
                          minWidth: `${FACTION_ICON_PREVIEW_PX}px`,
                          height: `${FACTION_ICON_PREVIEW_PX}px`,
                          position: 'relative',
                          transform: wrapRows ? undefined : `translateY(${FACTION_ICON_PREVIEW_OFFSET_PX}px)`,
                        }}
                      >
                        <FactionIcon
                          faction={fc as FactionId}
                          size={FACTION_ICON_PREVIEW_PX}
                          sx={{ transform: `scale(${FACTION_ICON_PREVIEW_SCALE})`, transformOrigin: 'center center' }}
                        />
                      </Box>
                    </MarkdownTooltip>
                  )
                }
              }
              // Replace textual set names with icons when enabled (except for the "All Currently Known" shorthand)
              if (c.key === 'ArtifactSetNames') {
                const allKnown = Boolean(rule.__allKnownSets)
                if (allKnown) {
                  const label = t('setAllKnownShorthand')
                  content = (
                    <EllipsisTooltip title={label} wrap="block">
                      <span
                        data-ellipsis-target
                        style={{
                          display: 'inline-block',
                          width: '100%',
                          overflow: 'hidden',
                          textOverflow: wrapRows ? 'clip' : 'ellipsis',
                          whiteSpace: wrapRows ? 'normal' : 'nowrap',
                          transform: `translateY(${SINGLE_LINE_PREVIEW_OFFSET_PX}px)`,
                        }}
                      >
                        {content}
                      </span>
                    </EllipsisTooltip>
                  )
                } else if (showSetIcons) {
                  const setIds = getSortedArtifactSets(rule)
                  const setEntries = setIds.map((id) => ({ id, label: artifactSetName(id) }))
                  const tooltipTitle = getArtifactSetLabel(rule)
                  // Compute the set icon list before embedding in JSX to avoid an IIFE inside JSX.
                  let setIconsContent: React.ReactNode
                  if (wrapRows) {
                    setIconsContent = setEntries.map(({ id, label }) => (
                      <SetIcon key={`set-${id}`} setId={id} label={label} sx={{ mr: 0 }} />
                    ))
                  } else {
                    const PAD_X = 12
                    const GAP_PX = 2
                    const unit = SET_ICON_PX + GAP_PX
                    const avail = Math.max(0, (c.width || 0) - PAD_X)
                    const capacity = Math.max(0, Math.floor(avail / unit))
                    const needsEllipsis = setEntries.length > capacity
                    const visibleCount = needsEllipsis ? Math.max(0, capacity - 1) : Math.min(setEntries.length, capacity)
                    const vis = setEntries.slice(0, visibleCount)
                    const overflow = Math.max(0, setEntries.length - visibleCount)
                    setIconsContent = (
                      <>
                        {vis.map(({ id, label }) => (
                          <SetIcon key={`set-${id}`} setId={id} label={label} sx={{ mr: 0 }} />
                        ))}
                        {overflow > 0 ? <Box component="span" sx={{ ml: 0.25 }}>…</Box> : null}
                      </>
                    )
                  }
                  content = (
                    <MarkdownTooltip markdown={tooltipTitle}>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, flexWrap: wrapRows ? 'wrap' : 'nowrap', maxWidth: '100%', overflow: wrapRows ? 'visible' : 'hidden', whiteSpace: wrapRows ? 'normal' : 'nowrap' }}>
                        {setIconsContent}
                      </Box>
                    </MarkdownTooltip>
                  )
                }
              }
              let cellInner: React.ReactNode = content
              if (isSub) {
                const substatTooltip = getSubstatTooltipSummary(rule)
                const substatSpan = (
                  <span style={{ display: 'inline-block', width: '100%', overflow: 'hidden', textOverflow: wrapRows ? 'clip' : 'ellipsis', whiteSpace: wrapRows ? 'normal' : 'nowrap' }}>
                    {content}
                  </span>
                )
                cellInner = substatTooltip
                  ? (
                    <MarkdownTooltip markdown={substatTooltip}>
                      {substatSpan}
                    </MarkdownTooltip>
                  )
                  : substatSpan
              } else if (showRecipeIdxNameTooltip) {
                cellInner = (
                  <MarkdownTooltip
                    // Apply the [rrggbb] directive color inside the tooltip when present.
                    {...(previewRuleColor
                      ? { render: <Typography variant="body2" component="span" sx={{ color: previewRuleColor }}>{previewRuleName}</Typography> }
                      : { markdown: previewRuleName }
                    )}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        transform: `translateY(${SINGLE_LINE_PREVIEW_OFFSET_PX}px)`,
                      }}
                    >{content}</span>
                  </MarkdownTooltip>
                )
              } else if (
                String(value).length
                && c.key !== 'ArtifactTypeNames'
                && c.key !== 'ArtifactSetNames'
                && c.key !== 'RecipeIdx'
              ) {
                cellInner = (
                  <EllipsisTooltip title={value} wrap="block">
                    <span
                      data-ellipsis-target
                      style={{
                        display: 'inline-block',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        transform: `translateY(${SINGLE_LINE_PREVIEW_OFFSET_PX}px)`,
                      }}
                    >{content}</span>
                  </EllipsisTooltip>
                )
              }
              const alignY = wrapRows ? 'flex-start' : 'center'
              // Allow faction icon halos to bleed outside the cell without
              // forcing the row height to grow in single-line mode.
              const factionIconOverflow = (!wrapRows && c.key === 'Faction' && showFactionIcons)
              return (
                <TableCell
                  key={String(c.key)}
                  sx={{
                    fontFamily: isSub ? 'inherit' : FONT_FAMILY_MONO,
                    fontSize: FONT_SIZE_BASE_PX,
                    width: c.width,
                    // Apply per-row opacity so disabled rules dim without striking text.
                    opacity: rowOpacity,
                    color: isIdx
                      ? (keep ? 'success.main' : 'error.main')
                      // Apply the contrast-adjusted color to the recipe name column only (not the index).
                      : (tablePreviewRuleColor && c.key === 'RuleName')
                        ? tablePreviewRuleColor
                        : undefined,
                    // HSF-embedded recipe indices use italic + default cursor to signal they are non-interactive foreign references.
                    fontStyle: isHsfRecipeIdx ? 'italic' : undefined,
                    cursor: isHsfRecipeIdx ? 'default' : undefined,
                    overflow: wrapRows || factionIconOverflow ? 'visible' : 'hidden',
                    textOverflow: wrapRows || factionIconOverflow ? 'clip' : 'ellipsis',
                    whiteSpace: wrapRows ? 'normal' : 'nowrap',
                    wordBreak: wrapRows ? 'break-word' : 'normal',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: alignY,
                      height: wrapRows ? 'auto' : '100%',
                      width: '100%',
                      overflow: wrapRows || factionIconOverflow ? 'visible' : 'hidden',
                      textOverflow: wrapRows || factionIconOverflow ? 'clip' : 'ellipsis',
                      whiteSpace: wrapRows ? 'normal' : 'nowrap',
                    }}
                  >
                    {cellInner}
                  </Box>
                </TableCell>
              )
            })}
            </TableRow>
          )
        })}
        {padBottom > 0 && (
          <TableRow key="spacer-bottom" sx={{ height: padBottom }}>
            <TableCell colSpan={colSpan} sx={spacerSx} />
          </TableRow>
        )}
      </>
    )
  })()

  // Compute the scroll-range overlay box after tableBodyContent populates scrollRangeOverlay.
  // Why: the overlay box is rendered outside the table (in the outer <Box>) and must read the
  // finalized scrollRangeOverlay value set during table body computation above.
  const scrollRangeOverlayBox = scrollRangeOverlay ? (() => {
    const { start, end, total } = scrollRangeOverlay
    const startLabel = start.toLocaleString()
    const endLabel = end.toLocaleString()
    const totalLabel = total.toLocaleString()
    const label = start === end
      ? t('previewScrollRangeHintSingle', { start: startLabel, total: totalLabel })
      : t('previewScrollRangeHintRange', { start: startLabel, end: endLabel, total: totalLabel })
    return (
      <Box
        aria-hidden={!showScrollRangeHint}
        aria-live="polite"
        sx={(theme) => ({
          position: 'absolute',
          // Offset below the sticky table header so the flyout does not overlap column header cells.
          top: `calc(${headerHeightPx}px + ${theme.spacing(1.5)})`,
          right: theme.spacing(1.5),
          zIndex: theme.zIndex.tooltip,
          pointerEvents: 'none',
          px: 1.25,
          py: 0.5,
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.custom.paperOverlayBg,
          boxShadow: theme.shadows[3],
          color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
          transition: theme.transitions.create(['opacity', 'transform', 'top'], { duration: theme.transitions.duration.shorter }),
          opacity: showScrollRangeHint ? 1 : 0,
          transform: showScrollRangeHint ? 'translateY(0)' : 'translateY(-6px)',
        })}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: 0.15 }}>
          {label}
        </Typography>
      </Box>
    )
  })() : null

  return (
    <Box
      onMouseEnter={() => setIsHoveringArea(true)}
      onMouseLeave={() => {
        setIsHoveringArea(false)
        if (hoverRafIdRef.current !== null) { try { cancelAnimationFrame(hoverRafIdRef.current) } catch {} hoverRafIdRef.current = null }
        pendingLocalHoverRef.current = null
        applyDomHover(null)
        scheduleHoverPropagation(null)
      }}
      sx={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', position: 'relative' }}
    >
      <TableContainer
        ref={tableContainerRef}
        sx={(theme) => {
          const hoverBg = theme.custom.hoverBg
          const selectedHoverBg = theme.custom.selectedHoverBg
          return {
            width: '100%',
            position: 'relative',
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: needHScroll ? 'auto' : 'hidden',
            // Prevent scroll chaining to the page and stabilize scrollbar space
            overscrollBehaviorY: 'contain',
            overscrollBehaviorX: 'contain',
            // Firefox ignores scrollbar-gutter, so add inline padding there while Chrome keeps its native gutter.
            ...reserveScrollbarGutterSpace(),
            // Isolate layout/paint of the scroller to avoid causing app-level scrollbars during rapid scroll
            contain: 'layout paint',
            // CSS-only hover highlight class for hovered rows (recipe or safeguard; added imperatively).
            // Selected recipe rows get the stronger selected-hover bg; all other hovered rows the plain one.
            '& tr.row-hover[data-selected-recipe="true"]': { backgroundColor: selectedHoverBg },
            '& tr.row-hover:not([data-selected-recipe="true"])': { backgroundColor: hoverBg },
            // Stacked: cap the scroller so the page (not the table) owns the long scroll. Side-by-side
            // (native or forced-zoom): fill the paper's fixed height instead — driven by the
            // isSideBySide prop, not a viewport-width media query, so it tracks the dynamic-zoom layout.
            ...(isSideBySide
              ? { flex: 1, minHeight: 0, maxHeight: '100%', height: '100%' }
              : { maxHeight: 960 }),
          }
        }}
        data-tour-id="preview.table"
        onMouseMove={(e) => {
          const target = e.target as HTMLElement | null
          if (target && target.closest('thead')) {
            rowHint.triggerProps.onMouseLeave()
            return
          }
          // Safeguard rows intentionally have no row actions; suppress the affordance hint there.
          if (target && target.closest(`tr[data-rule-source="${RULE_SOURCE_SAFEGUARDS}"]`)) {
            rowHint.triggerProps.onMouseLeave()
            return
          }
          // Empty space below the rows has no context menu handler; suppress the hint there too.
          if (target && !target.closest('tbody tr')) {
            rowHint.triggerProps.onMouseLeave()
            return
          }
          headerHint.triggerProps.onMouseLeave()
          const container = tableContainerRef.current
          if (container) {
            const rect = container.getBoundingClientRect()
            const withinContentX = e.clientX >= (rect.left + container.clientLeft)
              && e.clientX < (rect.left + container.clientLeft + container.clientWidth)
            const withinContentY = e.clientY >= (rect.top + container.clientTop)
              && e.clientY < (rect.top + container.clientTop + container.clientHeight)
            // Ignore scrollbar gutter regions so the hint only appears where a context menu can open.
            if (!withinContentX || !withinContentY) {
              rowHint.triggerProps.onMouseLeave()
              return
            }
          }
          rowHint.triggerProps.onMouseMove(e)
        }}
        onMouseLeave={() => {
          headerHint.triggerProps.onMouseLeave()
          rowHint.triggerProps.onMouseLeave()
        }}
      >
        <Table
          size="small"
          stickyHeader
          sx={{
            tableLayout: 'fixed',
            width: '100%',
            // Force single-line mode to a strict fixed row height so TanStack offsets stay exact without measuring.
            // Why: MUI's default cell padding can produce slight row-height variance unless we clamp it.
            ...(wrapRows ? {} : {
              '& tbody tr[data-row-index]': {
                height: `${RULES_TABLE_FIXED_ROW_HEIGHT_PX}px`,
                minHeight: `${RULES_TABLE_FIXED_ROW_HEIGHT_PX}px`,
                maxHeight: `${RULES_TABLE_FIXED_ROW_HEIGHT_PX}px`,
              },
              '& tbody tr[data-row-index] > td': {
                // 0.25 theme spacing ≈ 2px: enough breathing room without affecting the fixed height.
                py: 0.25,
                height: `${RULES_TABLE_FIXED_ROW_HEIGHT_PX}px`,
                maxHeight: `${RULES_TABLE_FIXED_ROW_HEIGHT_PX}px`,
              },
            }),
          }}
        >
          <TableHead
            ref={headerRef}
            data-tour-id="preview.header"
            onContextMenu={(e) => {
              try {
                e.preventDefault()
                e.stopPropagation()
              } catch {}
              headerHint.onOpen()
              rowHint.triggerProps.onMouseLeave()
              closeRowMenu()
              setHeaderMenu({ open: true, x: e.clientX, y: e.clientY })
            }}
            onMouseMove={(e) => {
              rowHint.triggerProps.onMouseLeave()
              headerHint.triggerProps.onMouseMove(e)
            }}
            onMouseLeave={headerHint.triggerProps.onMouseLeave}
          >
            <TableRow>
              {visibleColsForContainer.map((c) => {
                const realIdx = cols.findIndex(x => x.key === c.key)
                return (
                  <TableCell
                    key={String(c.key)}
                    draggable
                    onDragStart={() => onHeaderDragStart(realIdx)}
                    onDragOver={onHeaderDragOver}
                    onDrop={() => onHeaderDrop(realIdx)}
                    sx={{ width: c.width, fontWeight: 600, fontSize: FONT_SIZE_BASE_PX, userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                      <MarkdownTooltip markdown={t('rulesHeaderHelp', { label: colHeaderLabel(c.key) })}>
                        <span>{colHeaderLabel(c.key)}</span>
                      </MarkdownTooltip>
                    </Box>
                    <Box onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startResize(realIdx, e.clientX) }} sx={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 6, cursor: 'col-resize', zIndex: 2 }} />
                  </TableCell>
                )
              })}
            </TableRow>
            </TableHead>
          <TableBody>
            {tableBodyContent}
          </TableBody>
        </Table>
        {showEmptyOverlay && emptyLabel ? (
          <Box
            sx={{
              pointerEvents: 'none',
              position: 'absolute',
              left: 0,
              right: 0,
              top: headerHeightPx,
              bottom: 0,
              display: 'flex',
              // Stacked layout keeps the message anchored to the top edge, so let it stretch to full width.
              alignItems: emptyStateVerticalAlign === 'top' ? 'stretch' : 'center',
              // Stacked layout benefits from seeing the message immediately at the top; side-by-side feels
              // more balanced when we center within the taller preview pane.
              justifyContent: emptyStateVerticalAlign === 'top' ? 'flex-start' : 'center',
              px: 2,
            }}
          >
            <Box
              sx={{
                pointerEvents: 'auto',
                width: '100%',
                // Stacked layout has extra horizontal room; avoid a narrow centered box that looks "floating".
                maxWidth: emptyStateVerticalAlign === 'top' ? '100%' : 520,
              }}
            >
              <EmptyStateMessage typographyVariant="body2" minHeight="100%" verticalAlign={emptyStateVerticalAlign}>
                {emptyLabel}
              </EmptyStateMessage>
            </Box>
          </Box>
        ) : null}
      </TableContainer>
      {scrollRangeOverlayBox}
      {headerHint.overlay}
      {rowHint.overlay}
      
      {/* Header context menu (columns + wrap toggle) */}
      <Menu
        open={Boolean(headerMenu?.open)}
        onClose={closeHeaderMenu}
        anchorReference="anchorPosition"
        {...(headerMenu?.open ? { anchorPosition: { top: headerMenu.y, left: headerMenu.x } } : {})}
        slotProps={{
          paper: { ...buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard: headerMenuGuard,
            onRequestClose: closeHeaderMenu,
            closeLabel: t('close'),
            'data-tour-id': 'preview.header.menu',
          }), ref: headerMenuPaperRef },
        }}
      >
        <MenuToggleRow label={t('rulesMenuWrapRows')} checked={wrapRows} onChange={() => setWrapRows(!wrapRows)} labelSx={HEADER_MENU_LABEL_SX} />
        {/* Icon toggles (slots/factions/sets), the colour-scope toggle, and the colour-blind
            palette moved to the central options popout (ThemeEditorMenu): their effect is
            app-wide, not confined to this table. This menu keeps only table-local controls. */}
        <Divider />
        {/* Reset should sit above the column labels list */}
        <Box sx={{ px: 1.5, pt: 1, pb: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => {
              try { localStorage.removeItem(RULES_TABLE_WRAP_ROWS_KEY) } catch {}
              setStoredCols([])
              setWrapRows(false)
              closeHeaderMenu()
            }}
          >{t('headerMenuResetCols')}</Button>
          <Box sx={{ flex: 1 }} />
        </Box>
        {cols.map((c, idx) => {
          const isFaction = c.key === 'Faction'
          const val = isFaction ? (c.mode ?? 'auto') : (c.visible ? 'show' : 'hide')
          return (
            <MenuItem
              key={String(c.key)}
              onClick={(e) => {
                e.stopPropagation()
                if (isFaction) {
                  updateFactionColumnMode(idx, val as ColMode)
                } else {
                  const next = val === 'show' ? 'hide' : 'show'
                  updateColumns(prev => prev.map((x, i) => (i === idx ? { ...x, visible: next === 'show' } : x)))
                }
              }}
              sx={{ gap: 1 }}
            >
              <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{colMenuLabel(c.key)}</Typography>
              {isFaction ? (
                <CycleButton
                  options={[
                    { value: 'auto', label: t('headerMenuAuto')   },
                    { value: 'show', label: t('headerMenuShown')  },
                    { value: 'hide', label: t('headerMenuHidden') },
                  ]}
                  value={val}
                  color={val === 'auto' ? 'info' : 'success'}
                  variant={val === 'hide' ? 'outlined' : 'contained'}
                  onChange={(newMode) =>
                    updateColumns(prev => prev.map((col, i) => i === idx ? { ...col, mode: newMode as ColMode } : col))
                  }
                  sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX }}
                />
              ) : (
                <MarkdownTooltip markdown={val === 'show' ? t('headerMenuShownInTable') : t('headerMenuHiddenInTable')}>
                  <Button
                    size="small"
                    variant={val === 'show' ? 'contained' : 'outlined'}
                    color="success"
                    startIcon={val === 'show' ? <VisibilityIcon /> : <VisibilityOffIcon />}
                    sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                    onClick={(e) => { e.stopPropagation(); const next = val === 'show' ? 'hide' : 'show'; updateColumns(prev => prev.map((x, i) => (i === idx ? { ...x, visible: next === 'show' } : x))) }}
                  >{val === 'show' ? t('headerMenuShown') : t('headerMenuHidden')}</Button>
                </MarkdownTooltip>
              )}
            </MenuItem>
          )
        })}
      </Menu>
      {/* Row context menu (acts on the originating recipe when available) */}
      <Menu
        open={Boolean(rowMenu?.open)}
        onClose={closeRowMenu}
        anchorReference="anchorPosition"
        {...(rowMenu?.open ? { anchorPosition: { top: rowMenu.y, left: rowMenu.x } } : {})}
        slotProps={{
          paper: { ...buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard: rowMenuGuard,
            onRequestClose: closeRowMenu,
            closeLabel: t('close'),
          }), ref: rowMenuPaperRef },
        }}
      >
        {rowMenu?.source === RULE_SOURCE_HSF ? (
          <MenuItem onClick={() => { closeRowMenu(); onClearBase() }}>{t('rowMenuClear')}</MenuItem>
        ) : null}
        {rowMenu?.source === RULE_SOURCE_FINAL_SELL ? (
          <MenuItem onClick={() => { closeRowMenu(); onConfigureFinalSell() }}>{t('rowMenuEditFinalSell')}</MenuItem>
        ) : null}
        {rowMenu?.source === RULE_SOURCE_SFC ? [
          <MenuItem key="duplicate" onClick={() => { const i = rowMenu?.recipeIdx; closeRowMenu(); if (i !== null && i !== undefined) onRecipeAction(i, 'duplicate') }}>{t('rowMenuDuplicate')}</MenuItem>,
          <MenuItem key="move_top" onClick={() => { const i = rowMenu?.recipeIdx; closeRowMenu(); if (i !== null && i !== undefined) onRecipeAction(i, 'move_top') }}>{t('rowMenuMoveTop')}</MenuItem>,
          <MenuItem key="move_up" onClick={() => { const i = rowMenu?.recipeIdx; closeRowMenu(); if (i !== null && i !== undefined) onRecipeAction(i, 'move_up') }}>{t('rowMenuMoveUp')}</MenuItem>,
          <MenuItem key="move_down" onClick={() => { const i = rowMenu?.recipeIdx; closeRowMenu(); if (i !== null && i !== undefined) onRecipeAction(i, 'move_down') }}>{t('rowMenuMoveDown')}</MenuItem>,
          <MenuItem key="move_bottom" onClick={() => { const i = rowMenu?.recipeIdx; closeRowMenu(); if (i !== null && i !== undefined) onRecipeAction(i, 'move_bottom') }}>{t('rowMenuMoveBottom')}</MenuItem>,
          <MenuItem key="copy" onClick={() => { const i = rowMenu?.recipeIdx; closeRowMenu(); if (i !== null && i !== undefined) onRecipeAction(i, 'copy') }}>{t('rowMenuCopy')}</MenuItem>,
          <MenuItem key="paste_after" onClick={() => { const i = rowMenu?.recipeIdx; closeRowMenu(); if (i !== null && i !== undefined) onRecipeAction(i, 'paste_after') }}>{t('rowMenuPasteAfter')}</MenuItem>,
          <Divider key="divider" />,
          <MenuItem key="delete" onClick={() => { const i = rowMenu?.recipeIdx; closeRowMenu(); if (i !== null && i !== undefined) onRecipeAction(i, 'delete') }} sx={{ color: 'error.main' }}>{t('rowMenuDelete')}</MenuItem>,
        ] : null}
      </Menu>
    </Box>
  )
}

// Avoid re-rendering the large rules table when unrelated state (like builder name) changes
export const HsfRulesTableMemo = React.memo(HsfRulesTable)
