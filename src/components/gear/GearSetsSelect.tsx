import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, ListSubheader, MenuItem, Select } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import { useI18n } from '../../lib/i18n'
import type { ArtifactSetId } from '../../lib/types'
import { artifactSetName, filterAndSortSetEntries, getLocalizedGearSetName } from '../../lib/types'
import type { Metaset } from '../../lib/metasets'
import { metasetGlyph, orderMetasetIds, resolveMetasetIds } from '../../lib/metasets'
import type { ArtifactSetSelectionEntry } from '../../lib/gearSets/selection'
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from '../../lib/gearSets/selection'
import { useSetsOrderPreference } from '../../state/setsOrderPreference'
import InlineSelectClearButton from '../InlineSelectClearButton'
import InlineSelectExtraBadge from '../InlineSelectExtraBadge'
import SelectDropdownActivator from '../SelectDropdownActivator'
import SetMenuSection from '../SetMenuSection'
import SetsOrderControls from '../SetsOrderControls'
import EllipsisTooltip from '../EllipsisTooltip'
import {
  LIST_SUBHEADER_SX,
  MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX,
  MENU_MAX_HEIGHT_METASETS_PX,
  MENU_MAX_HEIGHT_SETS_LIST_PX,
  MENU_SCROLL_GUTTER_PX,
  SETS_MENU_WIDTH_PX,
  SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX,
} from '../../lib/constants'
import { reserveScrollbarGutterSpace } from '../../lib/scrollbar'
import { measureCssWidth } from '../../lib/domMeasurements'
import { pickEllipsisTarget } from '../../lib/ellipsis'
import {
  computeInlineSelectContentMaxWidth,
  computeInlineSelectPadding,
  estimateInlineSelectHiddenCount,
} from '../../lib/inlineSelectAffordances'
import { useGearSetCatalogVersion } from '../../hooks/useGearSetCatalogVersion'
import { ACCESSORY_NO_SET_ID } from '../../lib/constants'

type GearSetsSelectProps = {
  value: ArtifactSetSelectionEntry[]
  onChange: (next: ArtifactSetSelectionEntry[]) => void
  metasets?: Metaset[]
  selectedMetasetIds?: string[]
  onChangeMetasetIds?: (next: string[]) => void
  allowedSetIds?: readonly ArtifactSetId[]
  size?: SelectProps<string[]>['size']
  dataTourId?: string
  showMetasets?: boolean
  menuWidthPx?: number
  disabled?: boolean
  layoutVersion?: number
  anyLabel?: string
  includeNoSet?: boolean
  disabledSetIds?: number[]
  singleSelect?: boolean
  minWidthPx?: number
}

export default function GearSetsSelect({
  value,
  onChange,
  metasets = [],
  selectedMetasetIds = [],
  onChangeMetasetIds,
  allowedSetIds,
  size = 'small',
  dataTourId,
  showMetasets = true,
  menuWidthPx = SETS_MENU_WIDTH_PX,
  disabled = false,
  layoutVersion,
  anyLabel,
  includeNoSet = false,
  disabledSetIds,
  singleSelect = false,
  minWidthPx,
}: GearSetsSelectProps) {
  const { t, lang } = useI18n()
  // Keep the placeholder explicit when callers want "Any Set" instead of "Any".
  const anyText = anyLabel ?? t('any')
  const gearSetCatalogVersion = useGearSetCatalogVersion()
  const [setsOrder, setSetsOrder] = useSetsOrderPreference()
  const [setsSearch, setSetsSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAnchorPos, setMenuAnchorPos] = useState<{ top: number; left: number } | null>(null)
  const [hoveredMetasetId, setHoveredMetasetId] = useState<string | null>(null)
  const setsMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const setsMenuListRef = useRef<HTMLUListElement | null>(null)
  const metasetsMenuListRef = useRef<HTMLUListElement | null>(null)
  const selectContainerRef = useRef<HTMLDivElement | null>(null)
  // Single-select mode intentionally disables metaset selection.
  const allowMetasets = !singleSelect && showMetasets && Boolean(onChangeMetasetIds)
  const allowedSetFilter = useMemo(() => (
    allowedSetIds ? new Set(allowedSetIds.map(Number)) : null
  ), [allowedSetIds])
  const visibleMetasets = useMemo(
    () => (allowMetasets ? metasets.filter((meta) => meta.show !== false) : []),
    [allowMetasets, metasets],
  )
  const orderBasis = visibleMetasets.length ? visibleMetasets : metasets
  const orderedMetaSelected = useMemo(
    () => orderMetasetIds(allowMetasets ? selectedMetasetIds : [], orderBasis),
    [allowMetasets, orderBasis, selectedMetasetIds],
  )
  // Normalize selections so legacy arrays merge cleanly with exclusion entries.
  const normalizedSelections = useMemo(
    () => normalizeArtifactSetSelections(value),
    [value],
  )
  // Split include/exclude lists so UI logic can branch cleanly.
  const splitSelections = useMemo(
    () => splitArtifactSetSelections(normalizedSelections),
    [normalizedSelections],
  )
  // Build the Select token list from metasets + explicit includes.
  const selectedTokens = useMemo(() => ([
    ...orderedMetaSelected.map((id) => `m:${id}`),
    ...splitSelections.included.map((id) => `s:${Number(id)}`),
  ]), [orderedMetaSelected, splitSelections.included])

  // Build the display labels once so render + badge math stay in sync.
  const selectionLabels = useMemo(() => {
    void gearSetCatalogVersion
    // Collect labels in the same order as the display tokens.
    const names: string[] = []
    // Metasets stay in the token list; rebuild names from active metasets.
    for (const token of selectedTokens) {
      if (!token.startsWith('m:')) continue
      const id = token.slice(2)
      const meta = metasets.find((m) => m.id === id)
      if (!meta) continue
      const { glyph, iconId } = metasetGlyph(meta)
      if (glyph != null && iconId) {
        const needsGap = iconId !== 'empty'
        names.push(`${glyph}${needsGap ? ` ${meta.name}` : meta.name}`)
      } else {
        names.push(meta.name)
      }
    }
    // Explicit includes render as plain set names.
    for (const id of splitSelections.included) {
      const localized = getLocalizedGearSetName(id as ArtifactSetId, t, lang) || artifactSetName(id)
      names.push(localized)
    }
    // Explicit excludes render with a "not" prefix for clarity.
    for (const id of splitSelections.excluded) {
      const localized = getLocalizedGearSetName(id as ArtifactSetId, t, lang) || artifactSetName(id)
      names.push(`not ${localized}`)
    }
    return names
  }, [gearSetCatalogVersion, lang, metasets, selectedTokens, splitSelections.excluded, splitSelections.included, t])

  const renderValue = useCallback((tokens: string[]) => {
    void gearSetCatalogVersion
    // Treat excluded-only selections as active so they render in the label.
    if (tokens.length === 0 && splitSelections.excluded.length === 0) {
      return (
        <Box component="span" sx={{ display: 'block', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {anyText}
        </Box>
      )
    }
    // Collapse to "Any" when everything is cleared.
    const text = selectionLabels.length === 0 ? anyText : selectionLabels.join(', ')
    return (
      <EllipsisTooltip title={text} wrap="block">
        <Box
          component="span"
          data-ellipsis-target
          sx={{ display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {text}
        </Box>
      </EllipsisTooltip>
    )
  }, [anyText, gearSetCatalogVersion, selectionLabels, splitSelections.excluded.length])

  const handleTokensChange = useCallback((e: SelectChangeEvent<string[]>) => {
    // Normalize the token list so arrays never contain non-strings.
    const tokens = Array.isArray(e.target.value) ? e.target.value : []
    // Extract explicit set ids from tokens.
    const setIds = tokens.filter((token) => token.startsWith('s:')).map((token) => Number(token.slice(2)) as ArtifactSetId)
    // Single-select mode keeps only the most recently added set.
    const prevIncluded = splitSelections.included.map(Number)
    const nextSetIds = singleSelect
      ? (() => {
        // Detect the newly added set to preserve user intent.
        const nextUnique = Array.from(new Set(setIds))
        const prev = new Set(prevIncluded)
        const added = nextUnique.find((id) => !prev.has(id))
        if (added != null) return [added as ArtifactSetId]
        // If nothing was added, keep the remaining selection (or empty).
        return nextUnique.length > 0 ? [nextUnique[0] as ArtifactSetId] : []
      })()
      : setIds
    // Resolve metaset ordering when enabled.
    const metaIds = allowMetasets
      ? orderMetasetIds(tokens.filter((token) => token.startsWith('m:')).map((token) => token.slice(2)), orderBasis)
      : []
    // Deduplicate the explicit includes for stable output.
    const normalizedSets = Array.from(new Set(nextSetIds.map((id) => Number(id)))).sort((a, b) => a - b).map((id) => id as ArtifactSetId)
    // Preserve existing exclusions unless the user explicitly re-includes them.
    const excluded = singleSelect
      ? []
      : splitSelections.excluded.filter((id) => !normalizedSets.includes(id))
    // Merge the included and excluded selections into a single entry list.
    const nextSelections = normalizeArtifactSetSelections([
      ...normalizedSets.map((id) => ({ id })),
      ...excluded.map((id) => ({ id, excluded: true })),
    ])
    onChange(nextSelections)
    // Update metasets alongside the selection when enabled.
    if (allowMetasets && onChangeMetasetIds) {
      onChangeMetasetIds(metaIds)
    }
  }, [allowMetasets, onChange, onChangeMetasetIds, orderBasis, singleSelect, splitSelections.excluded, splitSelections.included])

  const scrollSetsMenuToSelected = useCallback((orderOverride?: 'game' | 'az' | 'icons', opts?: { force?: boolean }) => {
    void gearSetCatalogVersion
    if (!opts?.force && !menuOpen) return
    const order = orderOverride ?? setsOrder
    if (order === 'icons') return
    const list = setsMenuListRef.current
    if (!list) return
    const sortedForOrder = filterAndSortSetEntries(setsSearch, order, {
      translate: t,
      // Opt into the accessory no-set sentinel when requested by caller.
      includeNoSet,
      noSetLabel: t('noSetAccessories'),
    })
    const filtered = allowedSetFilter
      ? sortedForOrder.filter(([id]) => (
        // Honor allowed ids but keep the no-set sentinel when enabled.
        allowedSetFilter.has(Number(id)) || (includeNoSet && Number(id) === ACCESSORY_NO_SET_ID)
      ))
      : sortedForOrder
    // Scroll to the first explicitly included set to mirror builder behavior.
    const selectedIds = new Set(splitSelections.included.map(Number))
    let target: number | null = null
    for (const [id] of filtered) {
      const idNum = Number(id)
      if (selectedIds.has(idNum)) {
        target = idNum
        break
      }
    }
    if (target === null) return
    const scroll = () => {
      const item = list.querySelector<HTMLElement>(`[data-set-id="${target}"]`)
      item?.scrollIntoView({ block: 'nearest' })
    }
    requestAnimationFrame(() => requestAnimationFrame(scroll))
  }, [allowedSetFilter, gearSetCatalogVersion, includeNoSet, menuOpen, setsOrder, setsSearch, splitSelections.included, t])

  const sortedSets = useMemo(() => {
    void gearSetCatalogVersion
    const base = filterAndSortSetEntries(setsSearch, setsOrder, {
      translate: t,
      // Include the accessory no-set sentinel when requested by caller.
      includeNoSet,
      noSetLabel: t('noSetAccessories'),
    })
    if (!allowedSetFilter) return base
    return base.filter(([id]) => (
      // Keep no-set visible even when allowed ids are filtered.
      allowedSetFilter.has(Number(id)) || (includeNoSet && Number(id) === ACCESSORY_NO_SET_ID)
    ))
  }, [allowedSetFilter, gearSetCatalogVersion, includeNoSet, setsOrder, setsSearch, t])

  const handleToggleSet = useCallback((setId: number) => {
    const numeric = Number(setId)
    // Single-select mode keeps exactly one include (or clears when re-clicked).
    const normalized = singleSelect
      ? (
        splitSelections.included.some((id) => Number(id) === numeric)
          ? []
          : [numeric as ArtifactSetId]
      )
      : (() => {
        // Multi-select toggles only affect explicit includes.
        const next = new Set(splitSelections.included.map(Number))
        if (next.has(numeric)) {
          next.delete(numeric)
        } else {
          next.add(numeric)
        }
        // Keep stable ordering for deterministic payloads.
        return Array.from(next).sort((a, b) => a - b).map((id) => id as ArtifactSetId)
      })()
    // Drop exclusions when the set is explicitly re-added.
    const excluded = splitSelections.excluded.filter((id) => !normalized.includes(id))
    // Combine the updated include/exclude state into the selection payload.
    const nextSelections = normalizeArtifactSetSelections([
      ...normalized.map((id) => ({ id })),
      ...excluded.map((id) => ({ id, excluded: true })),
    ])
    onChange(nextSelections)
  }, [onChange, singleSelect, splitSelections.excluded, splitSelections.included])

  const metasetsMenu = useMemo(() => {
    if (!allowMetasets) return []
    if (!allowedSetFilter) return visibleMetasets
    return visibleMetasets.filter((meta) => meta.sets.every((setId) => allowedSetFilter.has(Number(setId))))
  }, [allowMetasets, allowedSetFilter, visibleMetasets])
  // Track which sets are implied by metasets so right-click only targets those.
  const metaDerivedSetIds = useMemo(() => (
    allowMetasets ? new Set(resolveMetasetIds(selectedMetasetIds ?? [], metasets)) : new Set<number>()
  ), [allowMetasets, metasets, selectedMetasetIds])
  const handleContextMenuSet = useCallback((id: number) => {
    // Ignore context menu events when metasets are not active.
    if (!allowMetasets) return
    // Only allow exclusion for sets that come from metasets.
    if (!metaDerivedSetIds.has(id)) return
    // Toggle exclusion state for this set id.
    const isExcluded = splitSelections.excluded.includes(id)
    // Exclusions should clear explicit includes for the same set.
    const nextIncluded = splitSelections.included.filter((entry) => entry !== id)
    const nextExcluded = isExcluded
      ? splitSelections.excluded.filter((entry) => entry !== id)
      : [...splitSelections.excluded, id]
    // Merge include/exclude entries into a normalized payload.
    const nextSelections = normalizeArtifactSetSelections([
      ...nextIncluded.map((entry) => ({ id: entry })),
      ...nextExcluded.map((entry) => ({ id: entry, excluded: true })),
    ])
    onChange(nextSelections)
  }, [allowMetasets, metaDerivedSetIds, onChange, splitSelections.excluded, splitSelections.included])
  const selectionCount = selectedTokens.length + splitSelections.excluded.length
  const hasSelection = selectionCount > 0
  // Keep the overflow badge in sync with real truncation, not just selection count.
  const [showExtraBadge, setShowExtraBadge] = useState(false)
  const showExtraBadgeRef = useRef(showExtraBadge)
  // Track how many labels are actually hidden by ellipsis.
  const [hiddenCount, setHiddenCount] = useState(0)
  const hiddenCountRef = useRef(hiddenCount)
  // Only measure overflow once we can actually show a badge.
  const shouldEvaluateBadge = selectionCount > 1
  // Calculate padding for the no-badge layout so we can compare against it.
  const paddingWithoutBadge = useMemo(
    () => computeInlineSelectPadding(hasSelection, false),
    [hasSelection],
  )
  // Calculate padding for the badge layout when we need it.
  const paddingWithBadge = useMemo(
    () => computeInlineSelectPadding(hasSelection, true),
    [hasSelection],
  )
  // Choose the active padding so the select width matches the badge state.
  const inlinePaddingPx = showExtraBadge ? paddingWithBadge : paddingWithoutBadge
  const contentMaxWidth = computeInlineSelectContentMaxWidth(inlinePaddingPx)
  // Mirror the tester filter behavior by showing how many sets/metasets extend beyond the inline label.
  const extraSelectionCount = showExtraBadge ? hiddenCount : 0

  // Keep the badge synchronized with layout changes (1 vs 2 column width).
  useEffect(() => {
    showExtraBadgeRef.current = showExtraBadge
    hiddenCountRef.current = hiddenCount
  }, [hiddenCount, showExtraBadge])

  useEffect(() => {
    if (!shouldEvaluateBadge) {
      if (showExtraBadgeRef.current) {
        showExtraBadgeRef.current = false
        setShowExtraBadge(false)
      }
      return
    }
    const container = selectContainerRef.current
    if (!container) {
      if (showExtraBadgeRef.current) {
        showExtraBadgeRef.current = false
        setShowExtraBadge(false)
      }
      return
    }
    let rafId = 0
    const updateBadge = () => {
      const selectDisplay = container.querySelector('.MuiSelect-select') as HTMLElement | null
      const ellipsisTarget = pickEllipsisTarget(selectDisplay ?? container)
      const style = getComputedStyle(ellipsisTarget)
      const supportsEllipsis = (
        (style.overflow === 'hidden' || style.overflowX === 'hidden')
        && style.textOverflow === 'ellipsis'
        && style.whiteSpace === 'nowrap'
      )
      if (!supportsEllipsis) {
        if (showExtraBadgeRef.current) {
          showExtraBadgeRef.current = false
          setShowExtraBadge(false)
        }
        return
      }
      const visibleWidth = measureCssWidth(ellipsisTarget)
      if (visibleWidth <= 0) {
        if (showExtraBadgeRef.current) {
          showExtraBadgeRef.current = false
          setShowExtraBadge(false)
        }
        return
      }
      const scrollWidth = Math.floor(ellipsisTarget.scrollWidth || 0)
      if (scrollWidth <= 0) {
        if (showExtraBadgeRef.current) {
          showExtraBadgeRef.current = false
          setShowExtraBadge(false)
        }
        return
      }
      const selectDisplayNode = selectDisplay ?? ellipsisTarget.closest('.MuiSelect-select') as HTMLElement | null
      const currentPaddingRight = selectDisplayNode
        ? Math.max(0, Number.parseFloat(getComputedStyle(selectDisplayNode).paddingRight || '0') || 0)
        : 0
      const noBadgeWidth = visibleWidth + Math.max(0, currentPaddingRight - paddingWithoutBadge)
      const withBadgeWidth = visibleWidth + Math.max(0, currentPaddingRight - paddingWithBadge)
      // Use label-aware counting when labels are available.
      if (selectionLabels.length > 0) {
        const hiddenNoBadge = estimateInlineSelectHiddenCount({
          labels: selectionLabels,
          root: ellipsisTarget,
          availableWidthPx: noBadgeWidth,
        })
        if (hiddenNoBadge <= 0) {
          if (showExtraBadgeRef.current || hiddenCountRef.current !== 0) {
            showExtraBadgeRef.current = false
            hiddenCountRef.current = 0
            setShowExtraBadge(false)
            setHiddenCount(0)
          }
          return
        }
        const hiddenWithBadge = estimateInlineSelectHiddenCount({
          labels: selectionLabels,
          root: ellipsisTarget,
          availableWidthPx: Math.max(0, withBadgeWidth),
        })
        const nextHiddenCount = Math.max(0, hiddenWithBadge)
        if (!showExtraBadgeRef.current || hiddenCountRef.current !== nextHiddenCount) {
          showExtraBadgeRef.current = true
          hiddenCountRef.current = nextHiddenCount
          setShowExtraBadge(true)
          setHiddenCount(nextHiddenCount)
        }
        return
      }
      const nextShowBadge = noBadgeWidth + 2 < scrollWidth
      if (nextShowBadge !== showExtraBadgeRef.current) {
        showExtraBadgeRef.current = nextShowBadge
        setShowExtraBadge(nextShowBadge)
      }
    }
    rafId = window.requestAnimationFrame(updateBadge)
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (rafId) window.cancelAnimationFrame(rafId)
      rafId = window.requestAnimationFrame(updateBadge)
    })
    observer.observe(container)
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [
    layoutVersion,
    paddingWithoutBadge,
    paddingWithBadge,
    selectedTokens,
    selectionCount,
    selectionLabels,
    shouldEvaluateBadge,
    splitSelections.excluded,
  ])

  const handleClear = useCallback(() => {
    onChange([])
    if (allowMetasets && onChangeMetasetIds) onChangeMetasetIds([])
  }, [allowMetasets, onChange, onChangeMetasetIds])
  // Keep the closed Select cheap: include only selected tokens so MUI value checks stay valid.
  // Why: full set/metaset menu trees are expensive when many selectors mount at once.
  const closedMenuItems = useMemo(() => (
    selectedTokens.map((token) => (
      <MenuItem
        key={`closed-${token}`}
        value={token}
        sx={{ display: 'none' }}
      />
    ))
  ), [selectedTokens])

  return (
    <Box
      ref={selectContainerRef}
      sx={{
        position: 'relative',
        ...(minWidthPx ? { minWidth: minWidthPx } : {}),
        ...(disabled ? { pointerEvents: 'none', opacity: 0.6 } : {}),
      }}
    >
      <Select
        multiple
        size={size}
        value={selectedTokens}
        onChange={handleTokensChange}
        renderValue={renderValue}
        data-tour-id={dataTourId}
        displayEmpty
        disabled={disabled}
        onOpen={(event) => {
          setMenuOpen(true)
          scrollSetsMenuToSelected(setsOrder, { force: true })
          try {
            const el = (event?.currentTarget as HTMLElement | null)
            const rect = el?.getBoundingClientRect()
            const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
            const margin = 8
            const theoreticalMax = metasetsMenu.length > 0
              ? MENU_MAX_HEIGHT_METASETS_PX + MENU_MAX_HEIGHT_SETS_LIST_PX
              : MENU_MAX_HEIGHT_SETS_LIST_PX
            const desiredTop = rect ? Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - theoreticalMax - margin)) : margin
            const desiredLeft = rect ? Math.floor(rect.left) : margin
            setMenuAnchorPos({ top: desiredTop, left: desiredLeft })
            const refine = () => {
              try {
                const paper = setsMenuPaperRef.current
                const measured = paper ? Math.ceil(paper.offsetHeight) : 0
                if (rect && measured > 0) {
                  const maxHeight = Math.min(measured, viewportH - margin * 2)
                  const top = Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - maxHeight - margin))
                  setMenuAnchorPos({ top, left: desiredLeft })
                }
              } catch { /* noop */ }
              if (metasetsMenu.length > 0) {
                try {
                  const list = metasetsMenuListRef.current
                  if (!list) return
                  const items = list.querySelectorAll<HTMLElement>('[data-metaset-id]')
                  const selected = new Set(selectedMetasetIds ?? [])
                  const targetMeta = (() => {
                    for (const meta of metasetsMenu) {
                      if (selected.has(meta.id)) return meta.id
                    }
                    return null
                  })()
                  if (targetMeta) {
                    for (const item of items) {
                      if (item.getAttribute('data-metaset-id') === targetMeta) {
                        item.scrollIntoView({ block: 'nearest' })
                        break
                      }
                    }
                  }
                } catch { /* noop */ }
              }
              scrollSetsMenuToSelected(setsOrder, { force: true })
            }
            requestAnimationFrame(() => requestAnimationFrame(refine))
          } catch {
            setMenuAnchorPos(null)
          }
        }}
        onClose={() => {
          setMenuOpen(false)
          setMenuAnchorPos(null)
          setHoveredMetasetId(null)
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              width: { xs: 'calc(100vw - 32px)', sm: menuWidthPx },
              maxWidth: menuWidthPx,
              overflowX: 'hidden',
            },
            ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el },
          },
          MenuListProps: { sx: { width: '100%', maxWidth: '100%' } },
          ...(menuAnchorPos
            ? { anchorReference: 'anchorPosition' as const, anchorPosition: menuAnchorPos, transformOrigin: { vertical: 'top', horizontal: 'left' as const } }
            : { transformOrigin: { vertical: 'top', horizontal: 'left' as const } }),
        }}
        sx={{
          width: '100%',
          minWidth: 0,
          cursor: 'pointer',
          '& .MuiSelect-select': {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
            maxWidth: '100%',
            cursor: 'pointer',
            paddingRight: `${inlinePaddingPx}px`,
          },
          '& .MuiSelect-select > *': {
            minWidth: 0,
            maxWidth: contentMaxWidth,
          },
          '& .MuiSelect-icon': {
            right: 8,
          },
        }}
      >
        {menuOpen ? (
          <>
            {allowMetasets && metasetsMenu.length > 0 ? (
              <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                <Box
                  component="ul"
                  ref={metasetsMenuListRef}
                  sx={{
                    listStyle: 'none',
                    p: 0,
                    m: 0,
                    maxHeight: MENU_MAX_HEIGHT_METASETS_PX,
                    overflowY: 'auto',
                    pr: `${MENU_SCROLL_GUTTER_PX}px`,
                    ...reserveScrollbarGutterSpace({ basePaddingInlineEnd: `${MENU_SCROLL_GUTTER_PX}px` }),
                  }}
                  data-tour-id="menu.metasets.section"
                >
                  <ListSubheader sx={LIST_SUBHEADER_SX}>{t('menuMetasetsSection')}</ListSubheader>
                  {metasetsMenu.map((meta) => {
                    const { glyph, iconId } = metasetGlyph(meta)
                    const hasGlyph = glyph != null && !!iconId
                    const needsGap = iconId !== null && iconId !== 'empty'
                    const tooltipName = hasGlyph ? `${glyph}${needsGap ? ` ${meta.name}` : meta.name}` : meta.name
                    const displayGap = hasGlyph && needsGap ? 0.75 : 0.5
                    const selected = (selectedMetasetIds ?? []).includes(meta.id)
                    const setNames = meta.sets.map((id) => getLocalizedGearSetName(id, t, lang)).filter(Boolean)
                    const joined = setNames.join(', ')
                    return (
                      <MenuItem
                        key={meta.id}
                        value={`m:${meta.id}`}
                        selected={selected}
                        data-metaset-id={meta.id}
                        onMouseEnter={() => setHoveredMetasetId(meta.id)}
                        onMouseLeave={() => setHoveredMetasetId((prev) => (prev === meta.id ? null : prev))}
                        onClick={(evt) => {
                          evt.preventDefault()
                          evt.stopPropagation()
                          if (!onChangeMetasetIds) return
                          const token = `m:${meta.id}`
                          const tokens = new Set(selectedTokens)
                          if (tokens.has(token)) tokens.delete(token); else tokens.add(token)
                          const metaIds = Array.from(tokens).filter((tok) => tok.startsWith('m:')).map((tok) => tok.slice(2))
                          onChangeMetasetIds(orderMetasetIds(metaIds, orderBasis))
                        }}
                      >
                        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                          <EllipsisTooltip title={tooltipName} wrap="block">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: displayGap, minWidth: 0 }}>
                              {hasGlyph ? (
                                <Box component="span" aria-hidden sx={{ fontSize: 18, width: 22, textAlign: 'center', lineHeight: 1 }}>
                                  {glyph}
                                </Box>
                              ) : null}
                              <Box component="span" data-ellipsis-target sx={{ display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {meta.name}
                              </Box>
                            </Box>
                          </EllipsisTooltip>
                          {setNames.length > 0 ? (
                            <EllipsisTooltip title={joined} wrap="block">
                              <Box component="span" data-ellipsis-target sx={{ fontSize: 12, color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }}>
                                {joined}
                              </Box>
                            </EllipsisTooltip>
                          ) : null}
                        </Box>
                      </MenuItem>
                    )
                  })}
                </Box>
              </Box>
            ) : null}
            <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
              <ListSubheader
                component="div"
                sx={[LIST_SUBHEADER_SX, { py: 0.5, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, boxSizing: 'border-box', width: `calc(100% - ${MENU_SCROLL_GUTTER_PX}px)` }]}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <SetsOrderControls
                    setsSearch={setsSearch}
                    onSetsSearchChange={setSetsSearch}
                    setsOrder={setsOrder}
                    onSetsOrderChange={(next) => {
                      if (!next) return
                      setSetsOrder(next)
                      scrollSetsMenuToSelected(next, { force: true })
                    }}
                    zeroResults={sortedSets.length === 0}
                  />
                </Box>
              </ListSubheader>
              <Box
                component="ul"
                ref={setsMenuListRef}
                sx={{
                  listStyle: 'none',
                  p: 0,
                  m: 0,
                  ...(setsOrder === 'icons'
                    ? { maxHeight: 'none', height: 'auto', overflowY: 'visible' }
                    : { maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX, height: MENU_MAX_HEIGHT_SETS_LIST_PX, overflowY: 'auto' }),
                  pr: `${MENU_SCROLL_GUTTER_PX}px`,
                  ...reserveScrollbarGutterSpace({ basePaddingInlineEnd: `${MENU_SCROLL_GUTTER_PX}px` }),
                }}
              >
                <SetMenuSection
                  title="Sets"
                  sorted={sortedSets}
                  setsOrder={setsOrder}
                  metasets={metasets}
                  setUsageCounts={{}}
                  showUsageCounts={false}
                  hideHeader
                  valueForSet={(id) => `s:${id}`}
                  hoveredMetasetId={hoveredMetasetId}
                  selectedMetasetIds={selectedMetasetIds}
                  selectedSetIds={splitSelections.included.map(Number)}
                  excludedSetIds={splitSelections.excluded.map(Number)}
                  disabledSetIds={disabledSetIds ?? []}
                  singleSelect={singleSelect}
                  onToggleSet={handleToggleSet}
                  onContextMenuSet={handleContextMenuSet}
                />
              </Box>
            </Box>
          </>
        ) : closedMenuItems}
      </Select>
      <InlineSelectExtraBadge count={extraSelectionCount} />
      <InlineSelectClearButton
        disabled={!hasSelection}
        label={t('clear')}
        onClear={handleClear}
      />
      <SelectDropdownActivator
        getDisplayNode={() => {
          const root = selectContainerRef.current
          if (!root) return null
          return root.querySelector('[role="combobox"]') as HTMLElement | null
        }}
        widthPx={hasSelection ? undefined : SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX}
      />
    </Box>
  )
}
