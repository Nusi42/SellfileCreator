import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDialogMinimizeAnimation } from '../hooks/useDialogMinimizeAnimation'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Select, Stack, TextField as MuiTextField, Typography, Divider, Radio, RadioGroup, ListSubheader } from '@mui/material'
import { useI18n } from '../lib/i18n'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import EllipsisTooltip from './EllipsisTooltip'
import type { Metaset } from '../lib/metasets'
import { filterAndSortSetEntries, getLocalizedGearSetName, type ArtifactSetId } from '../lib/types'
import { useGearSetCatalogVersion } from '../hooks/useGearSetCatalogVersion'
import { cloneMetaset, defaultMetasets } from '../lib/metasets'
import { DEFAULT_METASET_ICON_ID, METASET_ICON_OPTIONS, metasetIconOptionById, normalizeMetasetIconId, randomMetasetIconId } from '../lib/metasetIcons'
import type { MetasetIconId } from '../lib/metasetIcons'
// no constants needed here; sizes handled in SetsOrderControls
import { generateMetasetNameWithFlag } from '../lib/namegen'
import { keyframes } from '@emotion/react'
import SetMenuSection from './SetMenuSection'
import SetsOrderControls from './SetsOrderControls'
import InlineSelectClearButton from './InlineSelectClearButton'
import SelectDropdownActivator from './SelectDropdownActivator'
// MarkdownTooltip keeps the move/visibility/usage hints aligned with the rest of the tooltip cleanup.
import MarkdownTooltip from './MarkdownTooltip'
import {
  MENU_MAX_HEIGHT_SETS_LIST_PX,
  MENU_SCROLL_GUTTER_PX,
  MENU_MAX_HEIGHT_EXTRA_BUFFER,
  SETS_MENU_WIDTH_PX,
  MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX,
  BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
  SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX,
  SETS_SELECT_INLINE_GUTTER_PX,
  SMALL_BUTTON_HEIGHT_PX,
  METASETS_DIALOG_LIST_HEIGHT_PX,
  STANDARD_DIALOG_PADDING_BLOCK_UNITS,
  STANDARD_DIALOG_PADDING_INLINE_UNITS,
} from '../lib/constants'
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import type { HistoryEntryDescriptor, DescribeNextChangeFn } from '../hooks/useSfcHistory'

// Coalesce rapid per-click metaset edits into fewer App-level commits so the
// dialog remains responsive while previews rebuild in the background.
const METASETS_DIALOG_SYNC_DEBOUNCE_MS = 120 as const

function normalizeSetArray(values: readonly number[]): number[] {
  const deduped = new Set<number>()
  for (const id of values) deduped.add(Number(id))
  return Array.from(deduped).sort((a, b) => a - b)
}

function metasetStateEqual(a: Metaset, b: Metaset): boolean {
  if (a.name !== b.name) return false
  const visibleA = a.show !== false
  const visibleB = b.show !== false
  if (visibleA !== visibleB) return false
  const iconA = normalizeMetasetIconId(a.iconId ?? DEFAULT_METASET_ICON_ID)
  const iconB = normalizeMetasetIconId(b.iconId ?? DEFAULT_METASET_ICON_ID)
  if (iconA !== iconB) return false
  const setsA = normalizeSetArray(a.sets)
  const setsB = normalizeSetArray(b.sets)
  if (setsA.length !== setsB.length) return false
  for (let i = 0; i < setsA.length; i += 1) {
    if (setsA[i] !== setsB[i]) return false
  }
  return true
}

// Short golden glow effect reminiscent of a legendary pull. Intentionally subtle.
const legendaryGlow = keyframes`
  0% { box-shadow: 0 0 0px 0 rgba(255, 204, 0, 0), inset 0 0 0px 0 rgba(255, 230, 150, 0); }
  25% { box-shadow: 0 0 14px 3px rgba(255, 204, 0, 0.55), inset 0 0 8px 2px rgba(255, 230, 150, 0.45); }
  60% { box-shadow: 0 0 18px 6px rgba(255, 184, 0, 0.50), inset 0 0 12px 3px rgba(255, 224, 140, 0.45); }
  100% { box-shadow: 0 0 0px 0 rgba(255, 204, 0, 0), inset 0 0 0px 0 rgba(255, 230, 150, 0); }
`
const sparkleRise = keyframes`
  0% { transform: translateY(6px) scale(0.9); opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 0.85; }
  100% { transform: translateY(-10px) scale(1.05); opacity: 0; }
`

// Inner component handles draft state for a single metaset name field.
const MetasetNameFieldInner = React.memo(function MetasetNameFieldInner({ initialName, idx, highlight, allNames, onCommitName }: { initialName: string; idx: number; highlight: boolean; allNames: string[]; onCommitName: (value: string) => void }) {
  const [draft, setDraft] = useState(initialName)
  // Show error border when the current draft (trimmed) is already used by another metaset.
  const trimmedDraft = draft.trim()
  const isDuplicate = trimmedDraft.length > 0 && allNames.some((n, i) => i !== idx && n === trimmedDraft)
  return (
    <Box sx={{ position: 'relative', display: 'block', width: '100%', borderRadius: 1, overflow: 'visible' }}>
      {highlight && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            animation: `${legendaryGlow} 1400ms ease-out`,
            background: 'linear-gradient(145deg, rgba(255,240,180,0.15), rgba(255,208,0,0.12) 40%, rgba(255,150,0,0.10))',
            mixBlendMode: 'screen',
            filter: 'saturate(1.1)',
          }}
        />
      )}
      {highlight && (
        <>
          {[0,1,2,3,4].map((i) => (
            <Box key={i} aria-hidden sx={{
              position: 'absolute',
              left: `${10 + i*16}%`,
              top: '56%',
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: 'rgba(var(--mui-palette-warning-lightChannel) / 0.9)',
              boxShadow: '0 0 6px 2px rgba(var(--mui-palette-warning-mainChannel) / 0.6)',
              pointerEvents: 'none',
              animation: `${sparkleRise} 900ms ease-out`,
              animationDelay: `${80 * i}ms`,
            }} />
          ))}
        </>
      )}
      <MuiTextField
        size="small"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== initialName) {
            onCommitName(draft)
          }
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
        fullWidth
        error={isDuplicate}
        sx={{ m: 0 }}
      />
    </Box>
  )
})

// Outer wrapper resets draft state via key when name/id changes.
const MetasetNameField = React.memo(function MetasetNameField({ id, name, idx, highlight, allNames, onCommitName }: { id: string; name: string; idx: number; highlight?: boolean; allNames: string[]; onCommitName: (value: string) => void }) {
  const highlightActive = Boolean(highlight)
  return (
    <MetasetNameFieldInner
      key={`${id}:${name}`}
      initialName={name}
      idx={idx}
      highlight={highlightActive}
      allNames={allNames}
      onCommitName={onCommitName}
    />
  )
})

export default function MetasetsDialog({
  open,
  onClose,
  metasets,
  onMetasetsChange,
  describeNextChange,
  onDeleteMetaset,
  onResetMetasets,
  setUsageCounts,
  metasetUsageCounts,
  safeguardMetasetUsageCounts,
  onSelectRecipesByMetaset,
  onSelectSafeguardsByMetaset,
  setsSearch,
  onSetsSearchChange,
  setsOrder,
  onSetsOrderChange,
  metaSetsMenuOpen,
  setMetaSetsMenuOpen,
}: {
  open: boolean
  onClose: () => void
  metasets: Metaset[]
  onMetasetsChange: (next: Metaset[]) => void
  describeNextChange: DescribeNextChangeFn
  onDeleteMetaset: (id: string, opts?: { replaceWithSets?: boolean; replaceWithMetaId?: string }) => void
  onResetMetasets: (mode: 'delete' | 'replaceSets' | 'replaceMeta', replacementMetaId?: string) => void
  setUsageCounts: Record<number, number>
  metasetUsageCounts: Record<string, number>
  safeguardMetasetUsageCounts: Record<string, number>
  // When a chip is clicked, select all recipes/safeguards that reference this metaset.
  onSelectRecipesByMetaset: (id: string) => void
  onSelectSafeguardsByMetaset: (id: string) => void
  setsSearch: string
  onSetsSearchChange: (v: string) => void
  setsOrder: 'game' | 'az' | 'icons'
  onSetsOrderChange: (v: 'game' | 'az' | 'icons') => void
  metaSetsMenuOpen: boolean
  setMetaSetsMenuOpen: (v: boolean) => void
}) {
  const { t, lang } = useI18n()
  // Shared column width for both the header labels and the chips below them.
  // Must be wide enough for the longest translated header text at caption size.
  const USAGE_COL_W = 80
  // True when any metaset is referenced by at least one safeguard rule — controls
  // whether the "Safeguards" column header and per-row safeguard chip are rendered.
  const anySafeguardUsage = Object.values(safeguardMetasetUsageCounts).some((n) => n > 0)
  // Note: Ordering state is owned by the Builder and passed in via props to keep
  // behavior identical between Builder and Metasets editor. No persistence here.
  // Keep an in-dialog draft so click feedback never waits on App-wide rerenders.
  const [draftMetasets, setDraftMetasets] = useState<Metaset[]>(metasets)
  // Mirror the latest draft in a ref so delayed callbacks can read it safely.
  const draftMetasetsRef = useRef<Metaset[]>(metasets)
  // Track whether a delayed upstream publish is currently queued.
  const hasPendingPublishRef = useRef(false)
  // Timer handle for the delayed upstream publish.
  const publishTimeoutRef = useRef<number | null>(null)
  // Clear helper keeps timeout lifecycle in one place.
  const clearPendingPublish = useCallback(() => {
    if (publishTimeoutRef.current !== null) {
      window.clearTimeout(publishTimeoutRef.current)
      publishTimeoutRef.current = null
    }
  }, [])
  // Push the latest draft to App immediately (used on close/critical actions).
  // Skip the dispatch when no local edit is pending: draftMetasetsRef.current
  // can lag App.metasets after side-effects that mutate App state without
  // routing through scheduleDraftPublish (e.g. onDeleteMetaset's functional
  // update). Publishing a stale ref in that window would silently resurrect
  // just-deleted metasets when the dialog closes.
  const publishDraftNow = useCallback((next?: Metaset[]) => {
    if (next === undefined && !hasPendingPublishRef.current) {
      return
    }
    const payload = next ?? draftMetasetsRef.current
    clearPendingPublish()
    hasPendingPublishRef.current = false
    onMetasetsChange(payload)
  }, [clearPendingPublish, onMetasetsChange])
  // Queue a debounced App sync so rapid toggles collapse into one expensive rebuild.
  const scheduleDraftPublish = useCallback((next: Metaset[]) => {
    draftMetasetsRef.current = next
    setDraftMetasets(next)
    hasPendingPublishRef.current = true
    clearPendingPublish()
    publishTimeoutRef.current = window.setTimeout(() => {
      publishTimeoutRef.current = null
      hasPendingPublishRef.current = false
      onMetasetsChange(draftMetasetsRef.current)
    }, METASETS_DIALOG_SYNC_DEBOUNCE_MS)
  }, [clearPendingPublish, onMetasetsChange])
  // Shared helper for destructive actions that depend on App-owned recipe/safeguard rewrites.
  // Flush the draft first, then execute on the next frame so App callbacks read fresh state.
  const flushDraftThen = useCallback((run: () => void) => {
    publishDraftNow()
    window.requestAnimationFrame(() => {
      run()
    })
  }, [publishDraftNow])
  // Shrinks the dialog toward its trigger button when closing.
  const { dialogProps: metasetsDialogProps, animateClose: metasetsAnimateClose } = useDialogMinimizeAnimation('[data-tour-id="builder.manage-metasets"]')
  // Dialog close should never drop unsynced local edits.
  const handleDialogClose = useCallback(() => {
    publishDraftNow()
    metasetsAnimateClose(onClose)
  }, [onClose, publishDraftNow, metasetsAnimateClose])
  // Follow parent snapshots only when no local draft publish is queued.
  // Render-time state adjustment: sync draft to parent metasets when no publish is pending.
  const [prevMetasets, setPrevMetasets] = useState(metasets)
  if (metasets !== prevMetasets) {
    setPrevMetasets(metasets)
    // eslint-disable-next-line react-hooks/refs -- reading a stable flag ref during render-time derived-state update; does not affect rendering directly
    if (!hasPendingPublishRef.current) setDraftMetasets(metasets)
  }
  // Keep the draftMetasetsRef shadow in sync when the parent metasets change; deferred to layout.
  useLayoutEffect(() => {
    if (metasets !== prevMetasets && !hasPendingPublishRef.current) {
      draftMetasetsRef.current = metasets
    }
  }, [metasets, prevMetasets])
  // Dialog close/unmount must flush pending local edits so state never drifts.
  useEffect(() => {
    return () => {
      clearPendingPublish()
    }
  }, [clearPendingPublish])
  const [confirmResetMetasets, setConfirmResetMetasets] = useState(false)
  // Fixed screen anchor for per-row Sets menus so header position doesn't move when height changes
  const [setsMenuAnchorPos, setSetsMenuAnchorPos] = useState<{ top: number; left: number } | null>(null)
  const [resetMode, setResetMode] = useState<'delete' | 'replaceSets' | 'replaceMeta'>('delete')
  const [resetReplaceMetaId, setResetReplaceMetaId] = useState<string>('')
  const [confirmDeleteMetaId, setConfirmDeleteMetaId] = useState<string | null>(null)
  const [confirmClearMetaId, setConfirmClearMetaId] = useState<string | null>(null)
  const [deleteReplaceMetaId, setDeleteReplaceMetaId] = useState<string | ''>('')
  const [deleteMode, setDeleteMode] = useState<'delete' | 'replaceSets' | 'replaceMeta'>('delete')
  const [confirmBtnWidth, setConfirmBtnWidth] = useState<number>(320)
  const [resetConfirmBtnWidth, setResetConfirmBtnWidth] = useState<number>(320)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const measureResetRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  // Paper element for the per-row Sets select menu; used to measure actual
  // height after mount to refine the anchored position precisely.
  const setsRowMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const selectContainerRefsRef = useRef<Record<string, HTMLDivElement | null>>({})
  const setsMenuListRefsRef = useRef<Record<string, HTMLUListElement | null>>({})
  // Skip auto-scrolling after manual toggles so the list stays anchored where the user clicked.
  const skipSetsMenuAutoScrollRef = useRef(false)
  const [activeSetMenuMetaId, setActiveSetMenuMetaId] = useState<string | null>(null)
  // Prune stale per-row ref entries when metasets are removed.
  useLayoutEffect(() => {
    const active = new Set(draftMetasets.map(m => m.name))
    for (const key of Object.keys(selectContainerRefsRef.current)) {
      if (!active.has(key)) delete selectContainerRefsRef.current[key]
    }
    for (const key of Object.keys(setsMenuListRefsRef.current)) {
      if (!active.has(key)) delete setsMenuListRefsRef.current[key]
    }
  }, [draftMetasets])
  const [pendingScrollMetaId, setPendingScrollMetaId] = useState<string>('')
  const gearSetCatalogVersion = useGearSetCatalogVersion()
  // Ephemeral celebration for playful metaset names: highlight the new row's Select
  const [legendaryMetaId, setLegendaryMetaId] = useState<string>('')

  // Clamp list height so the dialog always reserves space for ten metasets while
  // still shrinking on smaller viewports.
  const metasetsListHeight = `min(${METASETS_DIALOG_LIST_HEIGHT_PX}px, 60vh)`

  // Shared set entries for the current search terms. Icons view reuses the in-game order.
  const sortedSetEntries = useMemo<Record<'game' | 'az' | 'icons', Array<[string, string]>>>(() => {
    void gearSetCatalogVersion
    const baseOptions = {
      translate: t,
      // Keep metaset set-picking aligned with other selectors that surface no-set.
      includeNoSet: true,
      noSetLabel: t('noSetAccessories'),
    }
    const sortedGame = filterAndSortSetEntries(setsSearch, 'game', baseOptions)
    const sortedAz = filterAndSortSetEntries(setsSearch, 'az', baseOptions)
    return {
      game: sortedGame,
      icons: sortedGame,
      az: sortedAz,
    }
  }, [gearSetCatalogVersion, setsSearch, t])

  const historySessionRef = useRef<'idle' | 'active'>('idle')
  const metasetBaselineRef = useRef<Map<string, Metaset> | null>(null)
  const metasetSessionHasEntryRef = useRef(false)

  const cloneMetasetMap = useCallback((list: Metaset[]): Map<string, Metaset> => {
    const map = new Map<string, Metaset>()
    for (const meta of list) {
      map.set(meta.name, cloneMetaset(meta))
    }
    return map
  }, [])

  const buildMetasetsAggregateDescriptor = useCallback((baselineMap: Map<string, Metaset>, currentList: Metaset[]): HistoryEntryDescriptor | null => {
    const currentMap = new Map<string, Metaset>()
    currentList.forEach((meta) => {
      currentMap.set(meta.name, meta)
    })

    const descriptors: HistoryEntryDescriptor[] = []

    for (const [id, baseMeta] of baselineMap.entries()) {
      const nextMeta = currentMap.get(id)
      if (!nextMeta) {
        descriptors.push({ kind: 'metasetDeleted', metaset: cloneMetaset(baseMeta), mode: 'delete' })
        continue
      }
      if (baseMeta.name !== nextMeta.name) {
        descriptors.push({ kind: 'metasetRenamed', previous: cloneMetaset(baseMeta), next: cloneMetaset(nextMeta) })
      }
      if ((baseMeta.show !== false) !== (nextMeta.show !== false)) {
        descriptors.push({ kind: 'metasetVisibilityChanged', previous: cloneMetaset(baseMeta), next: cloneMetaset(nextMeta) })
      }
      const baseSets = normalizeSetArray(baseMeta.sets)
      const nextSets = normalizeSetArray(nextMeta.sets)
      const setsChanged = baseSets.length !== nextSets.length
        || baseSets.some((value, idx) => value !== nextSets[idx])
      if (setsChanged) {
        descriptors.push({ kind: 'metasetSetsChanged', previous: cloneMetaset(baseMeta), next: cloneMetaset(nextMeta) })
      } else if (normalizeMetasetIconId(baseMeta.iconId ?? DEFAULT_METASET_ICON_ID) !== normalizeMetasetIconId(nextMeta.iconId ?? DEFAULT_METASET_ICON_ID)) {
        descriptors.push({ kind: 'metasetIconChanged', previous: cloneMetaset(baseMeta), next: cloneMetaset(nextMeta) })
      }
    }

    currentList.forEach((meta, index) => {
      if (!baselineMap.has(meta.name)) {
        void index
        descriptors.push({ kind: 'metasetAdded', metaset: cloneMetaset(meta) })
      }
    })

    if (descriptors.length === 0) return null
    return { kind: 'metasetsEditedSummary', entries: descriptors }
  }, [])

  useEffect(() => {
    historySessionRef.current = 'idle'
    metasetBaselineRef.current = null
    metasetSessionHasEntryRef.current = false
  }, [open])

  const recordHistory = useCallback((descriptor: HistoryEntryDescriptor | null, opts?: { mutated?: boolean; force?: boolean; nextMetasets?: Metaset[] }) => {
    const mutated = opts?.mutated === true
    const force = opts?.force === true
    const nextState = opts?.nextMetasets ?? draftMetasets

    let effectiveDescriptor = descriptor

    if (mutated && open) {
      if (!metasetBaselineRef.current) {
        metasetBaselineRef.current = cloneMetasetMap(draftMetasets)
        metasetSessionHasEntryRef.current = false
      }
      const baselineMap = metasetBaselineRef.current
      if (baselineMap) {
        effectiveDescriptor = buildMetasetsAggregateDescriptor(baselineMap, nextState)
      }
    }

    const shouldReplace = metasetSessionHasEntryRef.current && open
    const shouldEmit = Boolean(effectiveDescriptor) || shouldReplace || force
    if (shouldEmit) {
      const options = shouldReplace
        ? { writeMode: 'replace' as const, ...(effectiveDescriptor ? {} : { force: true as const }) }
        : (force ? { force: true as const } : undefined)
      describeNextChange(effectiveDescriptor, options)
      if (mutated && open) {
        metasetSessionHasEntryRef.current = Boolean(effectiveDescriptor)
      }
    }

    if (mutated) {
      historySessionRef.current = open ? 'active' : 'idle'
      if (!open) {
        metasetBaselineRef.current = null
        metasetSessionHasEntryRef.current = false
      }
    } else if (!open) {
      historySessionRef.current = 'idle'
      metasetBaselineRef.current = null
      metasetSessionHasEntryRef.current = false
    }
  }, [buildMetasetsAggregateDescriptor, cloneMetasetMap, describeNextChange, draftMetasets, open])

  // No dynamic width measurements: keep the header width fixed to the menu
  // Paper width so it does not jump when switching modes.

  const commitMetasetUpdate = useCallback((
    idx: number,
    mapper: (prev: Metaset) => Metaset,
    describe: (previous: Metaset, next: Metaset) => HistoryEntryDescriptor | null,
  ) => {
    // Resolve the current metaset so edits are scoped to a stable index.
    const previousMeta = draftMetasets[idx]
    if (!previousMeta) {
      recordHistory(null)
      return
    }
    // Apply the mapper to produce the next metaset state.
    const nextMeta = mapper(previousMeta)
    if (metasetStateEqual(previousMeta, nextMeta)) {
      recordHistory(null)
      return
    }
    // Snapshot the metasets used for the history entry so future edits do not mutate it.
    const descriptor = describe(cloneMetaset(previousMeta), cloneMetaset(nextMeta))
    const updated = draftMetasets.map((meta, metaIdx) => (metaIdx === idx ? nextMeta : meta))
    recordHistory(descriptor ?? null, { mutated: true, nextMetasets: updated })
    scheduleDraftPublish(updated)
  }, [draftMetasets, recordHistory, scheduleDraftPublish])

  // Measure the widest possible confirm button label and lock the button width
  useEffect(() => {
    const raf = confirmDeleteMetaId
      ? window.requestAnimationFrame(() => {
        try {
          const root = measureRef.current
          const btns = root ? Array.from(root.querySelectorAll('button')) as HTMLButtonElement[] : []
          let max = 0
          btns.forEach((b) => { max = Math.max(max, b.clientWidth) })
          max > 0 && setConfirmBtnWidth(max)
        } catch {}
      })
      : null
    return () => { typeof raf === 'number' && window.cancelAnimationFrame(raf) }
  }, [confirmDeleteMetaId])

  // Measure widest possible label for the Reset metasets dialog's confirm button
  useEffect(() => {
    const raf = confirmResetMetasets
      ? window.requestAnimationFrame(() => {
        try {
          const root = measureResetRef.current
          const btns = root ? Array.from(root.querySelectorAll('button')) as HTMLButtonElement[] : []
          let max = 0
          btns.forEach((b) => { max = Math.max(max, b.clientWidth) })
          max > 0 && setResetConfirmBtnWidth(max)
        } catch {}
      })
      : null
    return () => { typeof raf === 'number' && window.cancelAnimationFrame(raf) }
  }, [confirmResetMetasets])

  // When a metaset is added, scroll it into view to reduce friction
  useEffect(() => {
    const raf = pendingScrollMetaId
      ? window.requestAnimationFrame(() => {
        try {
	          const root = listRef.current
	          const target = root ? root.querySelector(`[data-meta-id="${pendingScrollMetaId}"]`) as HTMLElement | null : null
	          if (target && 'scrollIntoView' in target) {
	            target.scrollIntoView({ block: 'nearest' })
	          } else {
	            root && root.scrollTo({ top: root.scrollHeight })
	          }
	        } finally {
	          setPendingScrollMetaId('')
	        }
      })
      : null
    return () => { typeof raf === 'number' && window.cancelAnimationFrame(raf) }
  }, [draftMetasets, pendingScrollMetaId])
  const scrollMetasetSetsMenuToSelected = useCallback((metaId: string, orderOverride?: 'game' | 'az' | 'icons') => {
    if (!metaSetsMenuOpen) return
    const order = orderOverride ?? setsOrder
    if (order === 'icons') return
    const list = setsMenuListRefsRef.current[metaId]
    if (!list) return
    const meta = draftMetasets.find((m) => m.name === metaId)
    if (!meta || meta.sets.length === 0) return
    const selectedIds = new Set(meta.sets)
    const sortedForOrder = sortedSetEntries[order] ?? sortedSetEntries.game
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
  }, [draftMetasets, metaSetsMenuOpen, setsMenuListRefsRef, setsOrder, sortedSetEntries])
  // Auto-scroll to selected set when the active metaset changes — render-time comparison.
  const [prevActiveSetMenuMetaId, setPrevActiveSetMenuMetaId] = useState(activeSetMenuMetaId)
  if (activeSetMenuMetaId !== prevActiveSetMenuMetaId) {
    setPrevActiveSetMenuMetaId(activeSetMenuMetaId)
  }
  // Auto-scroll to selected set when the active metaset changes; deferred to layout so render stays pure.
  useLayoutEffect(() => {
    if (activeSetMenuMetaId !== prevActiveSetMenuMetaId && metaSetsMenuOpen && activeSetMenuMetaId) {
      if (skipSetsMenuAutoScrollRef.current) {
        skipSetsMenuAutoScrollRef.current = false
      } else {
        queueMicrotask(() => scrollMetasetSetsMenuToSelected(activeSetMenuMetaId))
      }
    }
  }, [activeSetMenuMetaId, prevActiveSetMenuMetaId, metaSetsMenuOpen, scrollMetasetSetsMenuToSelected])

  // Extract delete-dialog body content so no IIFE lives directly inside JSX.
  const deleteDialogBody = (() => {
    const id = confirmDeleteMetaId
    const m = draftMetasets.find(x => x.name === id)
    const recipeUsed = id ? (metasetUsageCounts[id] || 0) : 0
    const safeguardUsed = id ? (safeguardMetasetUsageCounts[id] || 0) : 0
    const totalUsed = recipeUsed + safeguardUsed
    const otherMetas = draftMetasets.filter(x => x.name !== id)
    const hasOtherMetas = otherMetas.length > 0
    const hasSets = Boolean(m && m.sets.length > 0)

    if (!id) return null

    if (totalUsed === 0) {
      // Simple confirmation (no replace options)
      return (
        <>
      <Typography variant="body2">{t('msgNoRefs')}</Typography>
        </>
      )
    }

    // Used > 0: present standard radio-driven choices
    return (
      <>
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          {t('refsCountWithSafeguards', { recipeCount: recipeUsed, safeguardCount: safeguardUsed })}
        </Typography>
        <Typography variant="body2" color="text.secondary">{t('msgChooseUpdate')}</Typography>
        <Divider sx={{ my: 1, opacity: 0.5 }} />
        <RadioGroup
          value={deleteMode}
          onChange={(_, v) => setDeleteMode((v as 'delete' | 'replaceSets' | 'replaceMeta') || 'delete')}
        >
          <FormControlLabel value="delete" control={<Radio />} label={t('metasetsDeleteRemoveRefsLabel')} />
          <FormControlLabel value="replaceSets" control={<Radio />} label={hasSets ? t('metasetsDeleteReplaceWithSetsLabel') : t('metasetsDeleteReplaceWithSetsNotAvailable')} disabled={!hasSets} />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(240px,1fr)', alignItems: 'center', gap: 1 }}>
            <FormControlLabel value="replaceMeta" control={<Radio />} label={t('metasetsDeleteReplaceWithMetasetLabel')} disabled={!hasOtherMetas} />
            <Select
              size="small"
              value={deleteReplaceMetaId}
              onChange={(e) => setDeleteReplaceMetaId(e.target.value as string)}
              displayEmpty
              disabled={!hasOtherMetas || deleteMode !== 'replaceMeta'}
              renderValue={(v) => {
                if (!hasOtherMetas) return t('metasetsNoMetasetsToReplaceWith')
                return v ? (draftMetasets.find(x => x.name === v)?.name ?? v) : t('metasetsChooseMetasetPlaceholder')
              }}
            >
              {otherMetas.map((mm) => (
                <MenuItem key={mm.name} value={mm.name}>{mm.name}</MenuItem>
              ))}
            </Select>
          </Box>
        </RadioGroup>
      </>
    )
  })()

  // Extract delete-dialog actions content so no IIFE lives directly inside JSX.
  const deleteDialogActionsContent = (() => {
    const id = confirmDeleteMetaId
    const recipeUsed = id ? (metasetUsageCounts[id] || 0) : 0
    const safeguardUsed = id ? (safeguardMetasetUsageCounts[id] || 0) : 0
    const totalUsed = recipeUsed + safeguardUsed
    const okReplaceMeta = deleteMode === 'replaceMeta' && Boolean(deleteReplaceMetaId)
    return (
      <>
        <Button onClick={() => { setConfirmDeleteMetaId(null); setDeleteReplaceMetaId(''); setDeleteMode('delete') }}>{t('cancel')}</Button>
        {totalUsed === 0 ? (
          <Button
            color="error"
            onClick={() => {
              const id2 = confirmDeleteMetaId!
              setConfirmDeleteMetaId(null)
              setDeleteReplaceMetaId('')
              setDeleteMode('delete')
              flushDraftThen(() => onDeleteMetaset(id2))
            }}
          >
            {t('delete')}
          </Button>
        ) : (
          <>
            <Button
              variant="contained"
              color={deleteMode === 'delete' ? 'error' : 'warning'}
              disabled={deleteMode === 'replaceMeta' && !okReplaceMeta}
              sx={{ width: confirmBtnWidth, whiteSpace: 'nowrap' }}
              onClick={() => {
                const id2 = confirmDeleteMetaId!
                const mode = deleteMode
                const repId = deleteReplaceMetaId
                setConfirmDeleteMetaId(null)
                setDeleteReplaceMetaId('')
                setDeleteMode('delete')
                if (mode === 'replaceSets') {
                  flushDraftThen(() => onDeleteMetaset(id2, { replaceWithSets: true }))
                } else if (mode === 'replaceMeta') {
                  flushDraftThen(() => onDeleteMetaset(id2, { replaceWithMetaId: repId }))
                } else {
                  flushDraftThen(() => onDeleteMetaset(id2))
                }
              }}
            >
              {deleteMode === 'delete'
                ? t('metasetsDeleteRemoveRefsLabel')
                : deleteMode === 'replaceSets'
                  ? t('metasetsDeleteReplaceWithSetsLabel')
                  : t('metasetsDeleteReplaceWithMetasetLabel')}
            </Button>
          </>
        )}
      </>
    )
  })()

  // Extract reset-dialog body content so no IIFE lives directly inside JSX.
  const resetDialogBody = (() => {
    // Combine recipe + Safeguard references; reset flow must keep both in sync.
    const totalRefs = draftMetasets.reduce((acc, meta) => (
      acc + (metasetUsageCounts[meta.name] || 0) + (safeguardMetasetUsageCounts[meta.name] || 0)
    ), 0)
    if (totalRefs === 0) {
      return (
          <Typography variant="body2">{t('msgResetNoRefs')}</Typography>
      )
    }
    const defaults = defaultMetasets()
    return (
      <>
            <Typography variant="body2">{t('msgResetSomeRefs')}</Typography>
        <Divider sx={{ my: 1, opacity: 0.5 }} />
        <RadioGroup value={resetMode} onChange={(_, v) => setResetMode((v as 'delete' | 'replaceSets' | 'replaceMeta') || 'delete')}>
          <FormControlLabel value="delete" control={<Radio />} label={t('metasetsResetRemoveRefsLabel')} />
          <FormControlLabel value="replaceSets" control={<Radio />} label={t('metasetsResetReplaceWithSetsLabel')} />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(240px,1fr)', alignItems: 'center', gap: 1 }}>
            <FormControlLabel value="replaceMeta" control={<Radio />} label={t('metasetsResetReplaceWithMetasetLabel')} />
            <Select
              size="small"
              value={resetReplaceMetaId}
              onChange={(e) => setResetReplaceMetaId(e.target.value as string)}
              disabled={resetMode !== 'replaceMeta'}
              displayEmpty
              renderValue={(v) => v ? (defaults.find(x => x.name === v)?.name ?? v) : t('metasetsChooseMetasetPlaceholder')}
            >
              {defaults.map(m => (
                <MenuItem key={m.name} value={m.name}>{m.name}</MenuItem>
              ))}
            </Select>
          </Box>
        </RadioGroup>
      </>
    )
  })()

  return (
    <>
      <Dialog open={open} onClose={handleDialogClose} maxWidth="lg" fullWidth transitionDuration={{ exit: 0 }} slotProps={{ paper: { ref: metasetsDialogProps.PaperProps.ref } }}>
        <DialogTitle>{t('titleManageMetasets')}</DialogTitle>
        <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }} data-tour-id="metasets.dialog">
          {/* Fixed header: description + column labels — lives outside the scroll container so nothing scrolls under it */}
          <Box sx={{ position: 'sticky', top: 0, zIndex: 1, px: STANDARD_DIALOG_PADDING_INLINE_UNITS, pt: STANDARD_DIALOG_PADDING_BLOCK_UNITS, pb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">{t('metasetsHeaderBlurb')}</Typography>
            <Divider sx={{ mt: 1, opacity: 0.5 }} />
          </Box>
          {/* Column label row: sits between description and the scroll area.
              overflow:hidden makes it a scroll container so scrollbar-gutter is honoured in Chrome,
              reserving the same right-side gutter as the list below — keeping labels aligned with chips. */}
          <Box sx={{
            px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
            pb: 0.5,
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 0.5,
            ...reserveScrollbarGutterSpace({ reserveStart: false }),
          }}>
            <Typography variant="caption" color="text.secondary" sx={{ width: USAGE_COL_W, textAlign: 'center' }}>
              {t('metasetsColumnRecipes')}
            </Typography>
            {anySafeguardUsage && (
              <Typography variant="caption" color="text.secondary" sx={{ width: USAGE_COL_W, textAlign: 'center' }}>
                {t('metasetsColumnSafeguards')}
              </Typography>
            )}
          </Box>
          <Divider sx={{ opacity: 0.4 }} />
          {/* Scrollable list only for metasets */}
          <Box
            ref={listRef}
            sx={{
              px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
              py: STANDARD_DIALOG_PADDING_BLOCK_UNITS,
              overflowY: 'auto',
              height: metasetsListHeight,
              maxHeight: metasetsListHeight,
              minHeight: metasetsListHeight,
              // Reserve right-side scrollbar gutter only (matches the column label row above).
              ...reserveScrollbarGutterSpace({ reserveStart: false }),
            }}
          >
            <Stack spacing={1}>
              {draftMetasets.map((m, idx) => {
                const iconId = (m.iconId ?? DEFAULT_METASET_ICON_ID) as MetasetIconId
                const hasSelectedSets = (m.sets?.length ?? 0) > 0
                const inlinePaddingPx = hasSelectedSets ? SETS_SELECT_INLINE_GUTTER_PX : SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX
                // Compute setsMenuActive and build the Select element outside JSX so the
                // inner IIFEs (targetSetId, setsMenuContent) are in plain JS context.
                const setsMenuActive = metaSetsMenuOpen && activeSetMenuMetaId === m.name
                // When active, render the full menu tree; otherwise omit to avoid churn.
                // sorted is derived upfront so it is available to the JSX below.
                const setsMenuSorted = sortedSetEntries[setsOrder] ?? sortedSetEntries.game
                const setsMenuContent = setsMenuActive ? (
                  <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                    {/* Keep header outside the scrollable items to avoid position jumps */}
                    <ListSubheader sx={{ opacity: 0.7, py: 0.5, my: 0, lineHeight: 2, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX }}>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, pr: `${MENU_SCROLL_GUTTER_PX}px` }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <SetsOrderControls
                          setsSearch={setsSearch}
                          onSetsSearchChange={onSetsSearchChange}
                          setsOrder={setsOrder}
                          onSetsOrderChange={onSetsOrderChange}
                          zeroResults={setsMenuSorted.length === 0}
                        />
                      </Box>
                    </ListSubheader>
                    <Box
                      component="ul"
                      ref={(el: HTMLUListElement | null) => { setsMenuListRefsRef.current[m.name] = el }}
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
                          // List modes: fixed height and always show a vertical scrollbar
                          // to keep width identical to icon mode.
                              maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX,
                              height: MENU_MAX_HEIGHT_SETS_LIST_PX,
                              overflowY: 'scroll',
                            }),
                        pr: `${MENU_SCROLL_GUTTER_PX}px`,
                        ...reserveScrollbarGutterSpace({ basePaddingInlineEnd: `${MENU_SCROLL_GUTTER_PX}px` }),
                      }}
                    >
                      <SetMenuSection
                        title={t('setsTitle')}
                        sorted={setsMenuSorted}
                        setsOrder={setsOrder}
                        metasets={draftMetasets}
                        excludeMetasetId={m.name}
                        setUsageCounts={setUsageCounts}
                        valueForSet={(id) => String(id)}
                        hideHeader
                        selectedSetIds={m.sets}
                        onToggleSet={(id) => {
                          skipSetsMenuAutoScrollRef.current = true
                          commitMetasetUpdate(
                            idx,
                            (prevMeta) => {
                              const nextIds = new Set<number>(prevMeta.sets)
                              if (nextIds.has(id)) {
                                nextIds.delete(id)
                              } else {
                                nextIds.add(id)
                              }
                              const arr = Array.from(nextIds).sort((a, b) => a - b)
                              return { ...prevMeta, sets: arr }
                            },
                            (previousMeta, nextMeta) => ({ kind: 'metasetSetsChanged', previous: previousMeta, next: nextMeta }),
                          )
                        }}
                      />
                    </Box>
                  </Box>
                ) : null
                // Build the full sets Select; setsMenuContent is null when the row is not active.
                const setsSelectElement = (
                  <Select
                    size="small"
                    multiple
                    fullWidth
                    value={m.sets.map(String)}
                    onChange={(e) => {
                      const incoming = (e.target.value as string[]).map(Number)
                      const ids = Array.from(new Set(incoming)).sort((a, b) => a - b)
                      skipSetsMenuAutoScrollRef.current = true
                      commitMetasetUpdate(
                        idx,
                        (prevMeta) => ({ ...prevMeta, sets: ids }),
                        (previousMeta, nextMeta) => ({ kind: 'metasetSetsChanged', previous: previousMeta, next: nextMeta }),
                      )
                    }}
                    renderValue={(selected) => (
                      (selected as string[])
                        .map((s) => getLocalizedGearSetName(Number(s) as ArtifactSetId, t, lang))
                        .join(', ')
                    )}
                    onOpen={(e) => {
                      setActiveSetMenuMetaId(m.name)
                      setMetaSetsMenuOpen(true)
                      try {
                        const el = (e?.currentTarget as HTMLElement | null)
                        const rect = el?.getBoundingClientRect()
                        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
                        const margin = 8
                        // dialog picker has only Sets header
                        const theoreticalMax = MENU_MAX_HEIGHT_SETS_LIST_PX + MENU_MAX_HEIGHT_EXTRA_BUFFER
                        const desiredTop = rect ? Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - theoreticalMax - margin)) : margin
                        const desiredLeft = rect ? Math.floor(rect.left) : margin
                        setSetsMenuAnchorPos({ top: desiredTop, left: desiredLeft })
                        const sorted = sortedSetEntries[setsOrder] ?? sortedSetEntries.game
                        const selectedSetIds = new Set(m.sets)
                        // Walk sorted entries to find the first selected set for auto-scroll.
                        let targetSetId: number | null = null
                        if (setsOrder !== 'icons' && selectedSetIds.size > 0) {
                          for (const [id] of sorted) {
                            const idNum = Number(id)
                            if (selectedSetIds.has(idNum)) { targetSetId = idNum; break }
                          }
                          if (targetSetId === null) {
                            const first = selectedSetIds.values().next()
                            targetSetId = first.done ? null : first.value
                          }
                        }
                        // After mount, measure real height and refine anchor
                        const refine = () => {
                          try {
                            const paper = setsRowMenuPaperRef.current
                            const measured = paper ? Math.ceil(paper.offsetHeight) : 0
                            if (rect && measured > 0) {
                              const maxHeight = Math.min(measured, viewportH - margin * 2)
                              const top = Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - maxHeight - margin))
                              setSetsMenuAnchorPos({ top, left: desiredLeft })
                            }
                          } catch {}
                          if (typeof targetSetId === 'number') {
                            try {
                              const list = setsMenuListRefsRef.current[m.name]
                              if (!list) return
                              const item = list.querySelector<HTMLElement>(`[data-set-id="${targetSetId}"]`)
                              if (item) item.scrollIntoView({ block: 'nearest' })
                            } catch {}
                          }
                          scrollMetasetSetsMenuToSelected(m.name, setsOrder)
                        }
                        requestAnimationFrame(() => requestAnimationFrame(refine))
                      } catch { setSetsMenuAnchorPos(null) }
                    }}
                    onClose={() => {
                      setMetaSetsMenuOpen(false)
                      setActiveSetMenuMetaId(null)
                      setSetsMenuAnchorPos(null)
                    }}
                    MenuProps={{
                      slotProps: { paper: { sx: { width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX }, maxWidth: SETS_MENU_WIDTH_PX, overflowX: 'hidden' }, ref: setsRowMenuPaperRef }, list: { sx: { width: '100%', maxWidth: '100%' } } },
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
                    sx={{
                      minWidth: 0,
                      cursor: 'pointer',
                      pr: `${inlinePaddingPx}px`,
                      '& .MuiSelect-select': {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                        cursor: 'pointer',
                      },
                      '& .MuiSelect-icon': {
                        right: 8,
                      },
                    }}
                  >
                    {setsMenuContent}
                  </Select>
                )
                // Usage counts cell: shows delete button and recipe/safeguard use chips.
                const recipeUsed = metasetUsageCounts[m.name] || 0
                const safeguardUsed = safeguardMetasetUsageCounts[m.name] || 0
                const totalUsed = recipeUsed + safeguardUsed
                const usageCountsCell = (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Button color="error" onClick={() => {
                      const hasSets = m.sets.length > 0
                      if (totalUsed === 0 && !hasSets) {
                        // Safe auto-delete: not used and empty. Must still flush any pending
                        // draft publish first; otherwise the debounced sync will fire after
                        // the delete and overwrite App state with a draft that still contains
                        // this metaset, resurrecting the deletion.
                        flushDraftThen(() => onDeleteMetaset(m.name))
                        return
                      }
                      // Otherwise open confirmation; default to delete action
                      setDeleteMode(totalUsed > 0 && hasSets ? 'replaceSets' : 'delete')
                      setDeleteReplaceMetaId('')
                      setConfirmDeleteMetaId(m.name)
                    }}>{t('delete')}</Button>
                    {recipeUsed > 0 ? (
                      <MarkdownTooltip markdown={t('metasetsUsesTooltip')}>
                        <Chip
                          size="small"
                          label={String(recipeUsed)}
                          color="warning"
                          sx={{ width: USAGE_COL_W, justifyContent: 'center', cursor: 'pointer' }}
                          onClick={() => {
                            try { onSelectRecipesByMetaset(m.name) } catch {}
                            // Close the dialog so the selection is visible in the recipe list
                            try { onClose() } catch {}
                          }}
                        />
                      </MarkdownTooltip>
                    ) : (
                      <Chip size="small" label={String(recipeUsed)} color="default" sx={{ width: USAGE_COL_W, justifyContent: 'center' }} />
                    )}
                    {/* Safeguard chip: always present when any safeguard uses a metaset so the
                        column aligns with the header label; clickable only when count > 0. */}
                    {anySafeguardUsage && (safeguardUsed > 0 ? (
                      <MarkdownTooltip markdown={t('metasetsSafeguardUsesTooltip')}>
                        <Chip
                          size="small"
                          label={String(safeguardUsed)}
                          color="warning"
                          sx={{ width: USAGE_COL_W, justifyContent: 'center', cursor: 'pointer' }}
                          onClick={() => {
                            try { onSelectSafeguardsByMetaset(m.name) } catch {}
                            // Close the dialog so the selection is visible in the safeguard list
                            try { onClose() } catch {}
                          }}
                        />
                      </MarkdownTooltip>
                    ) : (
                      <Chip size="small" label={String(safeguardUsed)} color="default" sx={{ width: USAGE_COL_W, justifyContent: 'center' }} />
                    ))}
                  </Box>
                )
                return (
                <Box
                  key={m.name}
                  data-meta-id={m.name}
                  // First row gets a stable tour-id so the tutorial can spotlight it individually.
                  data-tour-id={idx === 0 ? 'metasets.row.first' : undefined}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'auto auto 240px minmax(0,1fr) 80px auto',
                    rowGap: 1,
                    columnGap: 1,
                    alignItems: 'center',
                  }}
                >
                  {/* Move up/down controls */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    {/* Move/visibility controls now run through MarkdownTooltip, keeping tooltip styling consistent. */}
                    <MarkdownTooltip markdown={t('metasetsMoveUp')}>
                      <span>
                        <IconButton size="small" onClick={() => {
                          if (idx === 0) return
                          const arr = draftMetasets.slice()
                          const tmp = arr[idx - 1]!
                          arr[idx - 1] = arr[idx]!
                          arr[idx] = tmp
                          recordHistory(null, { mutated: true, nextMetasets: arr })
                          scheduleDraftPublish(arr)
                        }} disabled={idx === 0}>
                          <ArrowUpwardIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </MarkdownTooltip>
                    <MarkdownTooltip markdown={t('metasetsMoveDown')}>
                      <span>
                        <IconButton size="small" onClick={() => {
                          if (idx === draftMetasets.length - 1) return
                          const arr = draftMetasets.slice()
                          const tmp = arr[idx + 1]!
                          arr[idx + 1] = arr[idx]!
                          arr[idx] = tmp
                          recordHistory(null, { mutated: true, nextMetasets: arr })
                          scheduleDraftPublish(arr)
                        }} disabled={idx === draftMetasets.length - 1}>
                          <ArrowDownwardIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </MarkdownTooltip>
                  </Box>
                  {/* Visibility toggle aligns with reorder controls so names stay centered. */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MarkdownTooltip markdown={m.show === false ? t('metasetsHiddenFromMenus') : t('metasetsVisibleInMenus')}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={m.show === false ? t('metasetsVisibleInMenus') : t('metasetsHiddenFromMenus')}
                          onClick={() => {
                              commitMetasetUpdate(
                                idx,
                                (prevMeta) => ({ ...prevMeta, show: prevMeta.show === false ? true : false }),
                                (previousMeta, nextMeta) => ({ kind: 'metasetVisibilityChanged', previous: previousMeta, next: nextMeta }),
                              )
                          }}
                          sx={{
                            width: SMALL_BUTTON_HEIGHT_PX,
                            height: SMALL_BUTTON_HEIGHT_PX,
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: m.show === false ? 'success.main' : 'success.dark',
                            bgcolor: m.show === false ? 'transparent' : 'success.main',
                            color: m.show === false ? 'success.main' : 'success.contrastText',
                            '&:hover': {
                              bgcolor: 'success.dark',
                              borderColor: 'success.dark',
                              color: 'success.contrastText',
                            },
                          }}
                        >
                          {m.show === false ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </MarkdownTooltip>
                  </Box>
                  <MetasetNameField
                    id={m.name}
                    name={m.name}
                    idx={idx}
                    highlight={legendaryMetaId === m.name}
                    allNames={draftMetasets.map((dm) => dm.name)}
                    onCommitName={(nextName) => {
                      // Names are the primary key; reject renames that would create a duplicate.
                      const trimmed = nextName.trim()
                      if (!trimmed || draftMetasets.some((other, otherIdx) => otherIdx !== idx && other.name === trimmed)) return
                      commitMetasetUpdate(
                        idx,
                        (prevMeta) => ({ ...prevMeta, name: trimmed }),
                        (previousMeta, nextMeta) => ({ kind: 'metasetRenamed', previous: previousMeta, next: nextMeta }),
                      )
                    }}
                  />
                  <EllipsisTooltip
                    title={m.sets.map((id) => getLocalizedGearSetName(id, t, lang)).join(', ')}
                    selector=".MuiSelect-select"
                    disabled={metaSetsMenuOpen}
                    wrap="block"
                  >
                    <Box
                      ref={(el: HTMLDivElement | null) => {
                        selectContainerRefsRef.current[m.name] = el
                      }}
                      sx={{ position: 'relative' }}
                    >
                      {/* Only build the heavyweight menu tree for the actively opened row.
                          This avoids remounting hundreds of set menu items for every metaset
                          on each click, which was a major source of main-thread churn. */}
                      {setsSelectElement}
                      <InlineSelectClearButton
                        disabled={!hasSelectedSets}
                        label={t('clear')}
                        onClear={() => setConfirmClearMetaId(m.name)}
                      />
                      <SelectDropdownActivator
                        getDisplayNode={() => {
                          const root = selectContainerRefsRef.current[m.name]
                          if (!root) return null
                          return root.querySelector('[role="combobox"]') as HTMLElement | null
                        }}
                        widthPx={hasSelectedSets ? undefined : SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX}
                      />
                    </Box>
                  </EllipsisTooltip>
                  <Select
                    size="small"
                    value={iconId}
                    aria-label={t('metasetIconPickerLabel')}
                    onChange={(e) => {
                      const nextIconId = (e.target.value || DEFAULT_METASET_ICON_ID) as MetasetIconId
                      commitMetasetUpdate(
                        idx,
                        (prevMeta) => ({ ...prevMeta, iconId: nextIconId }),
                        (previousMeta, nextMeta) => ({ kind: 'metasetIconChanged', previous: previousMeta, next: nextMeta }),
                      )
                    }}
                    renderValue={(value) => {
                      const opt = metasetIconOptionById((value || DEFAULT_METASET_ICON_ID) as MetasetIconId)
                      return (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1, width: '100%' }} aria-hidden>
                          {opt.glyph}
                        </Box>
                      )
                    }}
                      MenuProps={{
                        slotProps: {
                          paper: {
                            sx: {
                              maxHeight: 320,
                              minWidth: 88,
                              width: 'auto',
                              '& .MuiList-root': {
                                display: 'grid',
                                gridTemplateColumns: 'repeat(6, 1fr)',
                                gap: 0.5,
                                py: 0.5,
                              },
                            },
                          },
                        },
                      }}
                      sx={{
                        minWidth: 72,
                        width: 72,
                        '& .MuiSelect-select': {
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                          lineHeight: 1,
                          px: 1.5,
                        },
                      }}
                    >
                    {METASET_ICON_OPTIONS.map((option) => {
                      // Derive a human-readable aria label from the icon id.
                      let aria: string
                      if (option.id === 'none') { aria = 'none' }
                      else if (option.id === 'empty') { aria = 'empty' }
                      else if (option.id.startsWith('glyph.num')) { aria = `number ${option.id.slice(-1)}` }
                      else { const [, raw] = option.id.split('.'); aria = raw?.replace(/[-_]/g, ' ') || option.id }
                      return (
                        <MenuItem
                          key={option.id}
                          value={option.id}
                          aria-label={aria}
                          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, px: 0.5, width: 'auto' }}
                        >
                          <Box component="span" sx={{ fontSize: 20, width: 32, textAlign: 'center' }} aria-hidden>{option.glyph}</Box>
                        </MenuItem>
                      )
                  })}
                  </Select>
                {usageCountsCell}
                  </Box>
                )
              })}
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button data-tour-id="metasets.add" onClick={() => {
            const { name, isFun } = generateMetasetNameWithFlag(draftMetasets.map(m => m.name))
            const iconId = randomMetasetIconId()
            // name is the primary key; use it for scroll/animation tracking
            setPendingScrollMetaId(name)
            if (isFun) {
              // Trigger a short celebratory glow on the new row's Select
              setLegendaryMetaId(name)
              window.setTimeout(() => setLegendaryMetaId(''), 1600)
            }
            const nextMeta = { name, sets: [], show: true, iconId }
            const nextMetasets = draftMetasets.concat(nextMeta)
            recordHistory({ kind: 'metasetAdded', metaset: cloneMetaset(nextMeta) }, { mutated: true, nextMetasets })
            scheduleDraftPublish(nextMetasets)
          }}>{t('addMetaset')}</Button>
          
          <Button size="small" variant="outlined" color="error" onClick={() => {
            // Default selection mirrors Delete: prefer replace-with-sets when possible
            try {
              const used = draftMetasets.filter(m => (metasetUsageCounts[m.name] || 0) > 0 || (safeguardMetasetUsageCounts[m.name] || 0) > 0)
              const anyHasSets = used.some(m => m.sets.length > 0)
              setResetMode(anyHasSets ? 'replaceSets' : 'delete')
            } catch { setResetMode('delete') }
            setResetReplaceMetaId('')
            setConfirmResetMetasets(true)
          }}>{t('resetToDefaults')}</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={handleDialogClose} data-tour-id="metasets.close">{t('close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Clear Metaset */}
      <Dialog open={Boolean(confirmClearMetaId)} onClose={() => setConfirmClearMetaId(null)}>
        <DialogTitle>{t('titleClearMetaset')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgClearMetaset')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearMetaId(null)}>{t('cancel')}</Button>
          <Button
            size="small"
            color="warning"
            onClick={() => {
              const id = confirmClearMetaId!
              setConfirmClearMetaId(null)
              const targetIdx = draftMetasets.findIndex(m => m.name === id)
              if (targetIdx === -1) {
                recordHistory(null)
                return
              }
              skipSetsMenuAutoScrollRef.current = true
              commitMetasetUpdate(
                targetIdx,
                (prevMeta) => ({ ...prevMeta, sets: [] }),
                (previousMeta, nextMeta) => ({ kind: 'metasetSetsChanged', previous: previousMeta, next: nextMeta }),
              )
            }}
            sx={{ height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX, minHeight: BUILDER_TOGGLE_BUTTON_HEIGHT_PX, whiteSpace: 'nowrap' }}
          >
            {t('clear')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete Metaset with replacement options */}
      <Dialog
        open={Boolean(confirmDeleteMetaId)}
        onClose={() => { setConfirmDeleteMetaId(null); setDeleteReplaceMetaId(''); setDeleteMode('delete') }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('titleDeleteMetaset')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1 }}>
          {/* Hidden measurer for confirm button width */}
          {Boolean(confirmDeleteMetaId) && (
            <Box ref={measureRef} sx={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
              <Button variant="contained">Delete and remove references</Button>
              <Button variant="contained">Replace with explicit sets</Button>
              <Button variant="contained">Replace with metaset</Button>
              <Button variant="contained">Delete</Button>
            </Box>
          )}
          {deleteDialogBody}
        </DialogContent>
        <DialogActions>
          {deleteDialogActionsContent}
        </DialogActions>
      </Dialog>

      {/* Confirm Reset Metasets */}
      <Dialog open={confirmResetMetasets} onClose={() => setConfirmResetMetasets(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('titleResetMetasets')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1 }}>
          {/* Hidden measurer for confirm button width (covers all labels) */}
          {confirmResetMetasets && (
            <Box ref={measureResetRef} sx={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
              <Button variant="contained">{t('metasetsResetRemoveRefs')}</Button>
              <Button variant="contained">{t('metasetsResetUseExplicitSets')}</Button>
              <Button variant="contained">{t('metasetsResetUseMetaset')}</Button>
            </Box>
          )}
          {resetDialogBody}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetMetasets(false)}>{t('cancel')}</Button>
          <Button
            variant="contained"
            color={resetMode === 'delete' ? 'error' : 'warning'}
            disabled={resetMode === 'replaceMeta' && !resetReplaceMetaId}
            sx={{ width: resetConfirmBtnWidth, whiteSpace: 'nowrap' }}
            onClick={() => {
              const replacement = resetMode === 'replaceMeta' ? resetReplaceMetaId : undefined
              flushDraftThen(() => onResetMetasets(resetMode, replacement))
              setConfirmResetMetasets(false)
              setResetMode('delete')
              setResetReplaceMetaId('')
            }}
          >
            {resetMode === 'delete'
              ? t('metasetsResetRemoveRefs')
              : resetMode === 'replaceSets'
                ? t('metasetsResetUseExplicitSets')
                : t('metasetsResetUseMetaset')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
/**
 * MetasetsDialog
 *
 * Modal editor for managing named metasets (groups of artifact set IDs).
 * Allows rename, toggle visibility, and set membership edits.
 */
