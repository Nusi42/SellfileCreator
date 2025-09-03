/**
 * App
 *
 * Top-level React component that orchestrates:
 * - Base HSF load/preview/merge and export
 * - HSFR (custom rules) load/save/copy and state management
 * - Rule builder UI, metasets, minima, and autosave
 * - Color management for substat chips and various dialogs
 */
import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { APP_VERSION } from './version'
import { readHsfFile, buildHsfFileFromMerged, hsfToBlob } from './lib/hsfIO'
import { artifactSetNames, StatId, StatVariant, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT, subToVariant } from './lib/types'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { buildHsfRules, type BuilderConfig, defaultMinima, type MinimaTable } from './lib/hsfBuilder'
import { findObsoleteRules } from './lib/hsfObsolete'
import { type Metaset, defaultMetasets, resolveMetasetIds } from './lib/metasets'
import { parseConfigsFromText, buildReadableConfig, readHsfrFile, parseHsfrObject, buildHsfrPayload, hsfrToBlob, parseHsfrText } from './lib/hsfrIO'
import { COPY_DIALOG_EVENT, writeTextSafe, readTextSafe } from './lib/clipboard'
import { loadAutosave, saveAutosave } from './lib/autosave'
// (Removed local CRC32; autosave utils provide it.)

import {
    Box,
    Button,
    Container,
    // Divider,
    Paper,
    Stack,
    Typography,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  GlobalStyles,
  // Popover,
} from '@mui/material'
import { Chip as MuiChip, IconButton, Tooltip } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { Snackbar, Alert } from '@mui/material'
// Icons for App header and controls are imported within components that use them
import ColorField from './components/ColorField'
import { HsfRulesTableMemo } from './components/HsfRulesTable'
import ConfigChip from './components/ConfigChip'
import ConfirmDialogs from './components/ConfirmDialogs'
import BuilderPanel from './components/BuilderPanel'
import CopyDialog from './components/CopyDialog'
import PasteDialog from './components/PasteDialog'
// Markdown preview for HSFR Note (read-only). Requires installation:
//   npm i @uiw/react-md-editor rehype-sanitize @uiw/react-markdown-preview
// Styles are imported globally here.
// If the deps are missing, the app will fail to compile; install them as above.
import NoteDialog from './components/NoteDialog'

// Components are organized under src/components

export default function App() {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  const [customCfgs, setCustomCfgs] = useState<BuilderConfig[]>([])
  const AUTOSAVE_KEY = 'autosave.hsfr.v1'
  const [restoreDlgOpen, setRestoreDlgOpen] = useState(false)
  const [restoreDraft, setRestoreDraft] = useState<null | { Version?: string; Metasets?: Metaset[]; Minima?: MinimaTable; Configs?: BuilderConfig[]; IncludeAllExplicitMeta?: boolean; SelectedConfigIndex?: number; Note?: string }>(null)
  const [autosaveReady, setAutosaveReady] = useState(false)
  const loadedAutosaveRef = useRef<null | { Version?: string; Metasets?: Metaset[]; Minima?: MinimaTable; Configs?: BuilderConfig[]; IncludeAllExplicitMeta?: boolean; SelectedConfigIndex?: number; Note?: string }>(null)
  const [selectedCfgIdx, setSelectedCfgIdx] = useState<number | null>(null)
  const [metasets, setMetasets] = useState<Metaset[]>(defaultMetasets())
  const [minima, setMinima] = useState<MinimaTable>(defaultMinima())
  const [hoveredCfgIdx, setHoveredCfgIdx] = useState<number | null>(null)
  const [includeAllExplicitMeta, setIncludeAllExplicitMeta] = useState<boolean>(false)
  // HSFR global Note (Markdown): editable in-app; auto-opens on load if present
  const [hsfrNote, setHsfrNote] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState<boolean>(false)
  const [noteMode, setNoteMode] = useState<'view' | 'edit'>('edit')
  // Measure left panel height to cap preview height
  const leftPaperRef = useRef<HTMLDivElement | null>(null)
  const [leftHeight, setLeftHeight] = useState<number>(0)
  useEffect(() => {
    const el = leftPaperRef.current
    if (!el) return
    const measure = () => { try { setLeftHeight(el.offsetHeight) } catch {} }
    measure()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(el)
    }
    const onWin = () => measure()
    window.addEventListener('resize', onWin)
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', onWin) }
  }, [])
  // Substat chip colors (persisted) — separate hex for text/border (fg) and background (bg)
  // Updated substat colors to better match in-game palette (dark theme friendly)
  const COLORS_STORAGE_KEY_V5 = 'substatColors.v5'
  const defaultSubstatColorMapV5 = (): Record<number, { fg: string; bg: string }> => {
    const base: Record<number, { fg: string; bg: string }> = {}
    for (const vk of [
      StatVariant.HP, StatVariant.HP_FLAT,
      StatVariant.ATK, StatVariant.ATK_FLAT,
      StatVariant.DEF, StatVariant.DEF_FLAT,
      StatVariant.SPD, StatVariant.RES, StatVariant.ACC, StatVariant.CR, StatVariant.CDMG,
    ]) {
      base[vk] = {
        fg: DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? '#90CAF9',
        bg: DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[vk] ?? '#E3F2FD',
      }
    }
    return base
  }
  const [substatColors, setSubstatColors] = useState<Record<number, { fg: string; bg: string }>>(() => {
    try {
      const raw = localStorage.getItem(COLORS_STORAGE_KEY_V5)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') return { ...defaultSubstatColorMapV5(), ...parsed }
      }
      return defaultSubstatColorMapV5()
    } catch { return defaultSubstatColorMapV5() }
  })
  useEffect(() => {
    try { localStorage.setItem(COLORS_STORAGE_KEY_V5, JSON.stringify(substatColors)) } catch {}
  }, [substatColors])
  // Usage counts for sets and metasets across current configs
  const setUsageCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const cfg of customCfgs) {
      const sets = cfg.artifactSets ?? []
      const seen = new Set<number>()
      for (const sid of sets) {
        if (seen.has(sid)) continue
        seen.add(sid)
        counts[sid] = (counts[sid] ?? 0) + 1
      }
    }
    return counts
  }, [customCfgs])
  const metasetUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const cfg of customCfgs) {
      const metas = cfg.artifactMetaSets ?? []
      const seen = new Set<string>()
      for (const mid of metas) {
        if (seen.has(mid)) continue
        seen.add(mid)
        counts[mid] = (counts[mid] ?? 0) + 1
      }
    }
    return counts
  }, [customCfgs])
  const [colorsDlgOpen, setColorsDlgOpen] = useState(false)
  const chipsContainerRef = useRef<HTMLDivElement | null>(null)
  const [hoverDeleteConfigs, setHoverDeleteConfigs] = useState(false)
  // Hide tooltips while user is scrolling to prevent viewport scrollbar flicker
  const hideTipsTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  useEffect(() => {
    const markScrolling = () => {
      try {
        document.body.classList.add('scrolling')
        if (hideTipsTimerRef.current) { clearTimeout(hideTipsTimerRef.current); hideTipsTimerRef.current = null }
        hideTipsTimerRef.current = window.setTimeout(() => {
          try { document.body.classList.remove('scrolling') } catch {}
        }, 250)
      } catch {}
    }
    const onWheel = () => markScrolling()
    const onScroll = () => markScrolling()
    const onTouchMove = () => markScrolling()
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('scroll', onScroll, true as unknown as undefined)
      window.removeEventListener('touchmove', onTouchMove)
      if (hideTipsTimerRef.current) { clearTimeout(hideTipsTimerRef.current); hideTipsTimerRef.current = null }
      try { document.body.classList.remove('scrolling') } catch {}
    }
  }, [])
  const [builder, setBuilder] = useState<BuilderConfig>({
    name: '',
    keep: true,
    rankCode: 0,
    rarityCode: 0,
    factionCode: 0,
    mainStatsV: [],

    startLevel: 0,
    rollBaseline: 'afterStart',
    rollMode: 'auto',
    substatsV: [],
    fixedSubstatsV: [],
    minCount: 0,
    autoMinCount: true,
    minRequiredRolls: 0,
    autoMinRequiredRolls: true,
  })
  
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)
  // Context menu for the chips area (Copy All / Paste)
  const [chipAreaMenu, setChipAreaMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  useEffect(() => {
    if (!chipAreaMenu?.open) return
    const handler = (e: MouseEvent) => { e.preventDefault() }
    window.addEventListener('contextmenu', handler)
    return () => { window.removeEventListener('contextmenu', handler) }
  }, [chipAreaMenu?.open])
  // Manual paste fallback dialog
  const [pasteDlgOpen, setPasteDlgOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteErr, setPasteErr] = useState<string | null>(null)
  const [pasteSelectOnEmpty, setPasteSelectOnEmpty] = useState(false)
  const [pasteAfterIdx, setPasteAfterIdx] = useState<number | null>(null)
  // Manual copy fallback dialog
  const [copyDlgOpen, setCopyDlgOpen] = useState(false)
  const [copyText, setCopyText] = useState('')
  const copyInputRef = React.useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  // Global file-drag UI state; overlay is visible only for real file drags
  const [fileDragActive, setFileDragActive] = useState<boolean>(false)
  const fileDragCounterRef = useRef<number>(0)
  // Track whether configs (and related data) differ from the last explicit Save
  const currentConfigSig = useMemo(() => JSON.stringify({ customCfgs, metasets, minima, includeAllExplicitMeta }), [customCfgs, metasets, minima, includeAllExplicitMeta])
  const [lastSavedSig, setLastSavedSig] = useState<string | null>(null)
  // Initialize saved signature on first render to avoid prompting when nothing changed yet
  useEffect(() => {
    if (lastSavedSig === null) setLastSavedSig(currentConfigSig)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const isDirty = useMemo(() => lastSavedSig !== null && currentConfigSig !== lastSavedSig, [currentConfigSig, lastSavedSig])
  // Warn on close/tab navigation if there are unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])


  // Clipboard helpers moved to src/lib/clipboard.ts

// For a duplicate action on index `idx`, insert the new copy after the last
  // contiguous sibling that shares the same base name, starting from idx.
  // Compute insertion index strictly based on config index: always after idx.
  /** Compute the insertion index just after a given config index. */
  function insertIndexAfter(list: BuilderConfig[], idx: number): number {
    return Math.min(list.length, idx + 1)
  }
  /** Parse and insert pasted HSFR content either after selection or at end.
   *  Also copies Note only when the current note is empty. */
  function handlePasteText(text: string) {
    try {
      const { cfgs, note } = parseHsfrText(text, { metasets, minima, includeAllExplicitMeta })
      if (cfgs.length === 0) {
        setPasteErr('No valid config found in pasted text')
        return false
      }
      setCustomCfgs(prev => {
        const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
          ? selectedCfgIdx + 1
          : prev.length
        return [...prev.slice(0, insertIdx), ...cfgs, ...prev.slice(insertIdx)]
      })
      if ((!hsfrNote || !hsfrNote.trim()) && typeof note === 'string' && note.trim()) {
        setHsfrNote(note)
      }
      setPasteErr(null)
      return true
    } catch {
      const cfgs = parseConfigsFromText(text, metasets)
      if (cfgs.length === 0) {
        setPasteErr('No valid config found in pasted text')
        return false
      }
      setCustomCfgs(prev => {
        const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
          ? selectedCfgIdx + 1
          : prev.length
        return [...prev.slice(0, insertIdx), ...cfgs, ...prev.slice(insertIdx)]
      })
      setPasteErr(null)
      return true
    }
  }

  /** Paste configs from the clipboard after the chip at index `idx`. */
  async function pasteAfterIndex(idx: number) {
    // Try clipboard first via safe helper
    const text = await readTextSafe()
    if (text && text.trim()) {
      try {
        const { cfgs, note } = parseHsfrText(text, { metasets, minima, includeAllExplicitMeta })
        if (cfgs.length > 0) {
          setCustomCfgs(prev => {
            const insertIdx = Math.min(prev.length, idx + 1)
            return [...prev.slice(0, insertIdx), ...cfgs, ...prev.slice(insertIdx)]
          })
          if ((!hsfrNote || !hsfrNote.trim()) && typeof note === 'string' && note.trim()) {
            setHsfrNote(note)
          }
          try {
            setSelectedCfgIdx(idx + cfgs.length)
            setBuilder(cfgs[cfgs.length - 1]!)
          } catch {}
          return
        }
      } catch {}
      const cfgs = parseConfigsFromText(text, metasets)
      if (cfgs.length > 0) {
        setCustomCfgs(prev => {
          const insertIdx = Math.min(prev.length, idx + 1)
          return [...prev.slice(0, insertIdx), ...cfgs, ...prev.slice(insertIdx)]
        })
        try {
          setSelectedCfgIdx(idx + cfgs.length)
          setBuilder(cfgs[cfgs.length - 1]!)
        } catch {}
        return
      }
    }
    // Fallback: open manual dialog and target insertion after idx
    setSelectedCfgIdx(idx)
    setPasteAfterIdx(idx)
    setPasteText('')
    setPasteErr(null)
    setPasteDlgOpen(true)
  }

  type HsfRuleWithCfg = HsfRule & { __cfgIdx?: number }
  const mergedRules = useMemo((): (HsfRule & { __cfgIdx?: number })[] => {
    // Always strip any foreign/internal fields (e.g., __cfgIdx) from base HSF rules
    const baseRaw = hsf?.Rules ?? []
    const base: HsfRule[] = baseRaw.map((r: HsfRule) => ({ ...r }))
    // Build an effective metaset list that optionally includes a synthetic
    // "All (Explicit)" metaset that expands to all known sets.
    const ALL_META_ID = 'meta__ALL_EXPLICIT'
    const allSets = Object.keys(artifactSetNames).map(Number)
    const metasetsEffective: Metaset[] = includeAllExplicitMeta
      ? [{ id: ALL_META_ID, name: 'All (Explicit)', sets: allSets }, ...metasets]
      : metasets

    const customs: HsfRuleWithCfg[] = customCfgs
      .map((c, cfgIdx) => {
        const fromMetas = resolveMetasetIds(c.artifactMetaSets, metasetsEffective)
        const explicit = c.artifactSets ?? []
        const union = Array.from(new Set<number>([...explicit, ...fromMetas].map(Number)))
        const cfgWithSets = { ...c, artifactSets: union }
        // Build and prune obsoletes within this config slice only to avoid cross-config tie-breaking artifacts
        const built = buildHsfRules(cfgWithSets, minima)
        const { obsolete } = findObsoleteRules(built)
        const drop = new Set(obsolete.map(o => o.index))
        const kept = built.filter((_, i) => !drop.has(i))
        return kept.map((r): HsfRule & { __cfgIdx: number } => ({ ...r, __cfgIdx: cfgIdx }))
      })
      .flat()

    // Build and then remove obsolete rules, but only when both the obsolete rule
    // and its covering rule originate from the same custom config. This preserves
    // duplicated configs and base-vs-custom overlaps in the preview.
    const merged: (HsfRule & { __cfgIdx?: number })[] = (base as (HsfRule & { __cfgIdx?: number })[]).concat(customs)
    // Do not perform cross-config pruning here; per-config pruning already applied above.
    return merged
  }, [hsf, customCfgs, metasets, minima, includeAllExplicitMeta])

  

  // Scroll the selected config chip into view within the chips container
  useEffect(() => {
    if (selectedCfgIdx === null) return
    const container = chipsContainerRef.current
    const el = document.getElementById(`cfg-chip-${selectedCfgIdx}`)
    if (!container || !el) return
    try {
      // Defer until after layout
      requestAnimationFrame(() => {
        const cRect = container.getBoundingClientRect()
        const eRect = el.getBoundingClientRect()
        const cur = container.scrollTop
        const topDelta = eRect.top - cRect.top
        const botDelta = eRect.bottom - cRect.bottom
        let target = cur
        if (topDelta < 0) {
          // Element is above viewport: align its top with container top
          target = Math.max(0, cur + topDelta)
        } else if (botDelta > 0) {
          // Element is below viewport: align its bottom with container bottom
          target = Math.max(0, cur + botDelta)
        }
        if (target !== cur) container.scrollTo({ top: target, behavior: 'smooth' })
      })
    } catch {}
  }, [selectedCfgIdx, customCfgs.length])

  // Load autosaved HSFR on mount (offer to restore)
  useEffect(() => {
    try {
      const entry = loadAutosave<unknown>(AUTOSAVE_KEY)
      if (!entry) return
      const data = entry.payload
        // Only prompt if there are no existing custom configs
        if (customCfgs.length === 0 && data && typeof data === 'object') {
          const parsed = parseHsfrObject(data as unknown, { metasets, minima, includeAllExplicitMeta })
          const cfgs = parsed.cfgs
          const savedMetasets = parsed.metasets
          const savedMinima = parsed.minima
          const savedIncludeAll = parsed.includeAllExplicitMeta
          const normMetas = (mets?: unknown[]) => {
            if (!mets) return '[]'
            const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k,v]) => [v, Number(k)]))
            const copy = mets.map((m: unknown) => {
              const mRec = m as Record<string, unknown>
              const names: unknown[] = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
              const sets: number[] = Array.isArray(mRec['sets']) ? (mRec['sets'] as number[]) : names.map(n => setIdByName.get(String(n))).filter((x): x is number => typeof x === 'number')
              return ({ id: String(mRec['id']), name: String(mRec['name']), sets: [...sets].sort((a,b)=>a-b) })
            })
            copy.sort((a,b) => String(a.id).localeCompare(String(b.id)))
            return JSON.stringify(copy)
          }
          const canonicalize = (x: unknown): unknown => {
            if (Array.isArray(x)) return x.map(canonicalize)
            if (x && typeof x === 'object') {
              const keys = Object.keys(x).sort()
              const out: Record<string, unknown> = {}
              for (const k of keys) out[k] = canonicalize((x as Record<string, unknown>)[k])
              return out
            }
            return x
          }
          const metasetsMatchDefaults = normMetas(savedMetasets) === normMetas(defaultMetasets())
          const minimaMatchDefaults = JSON.stringify(canonicalize(savedMinima)) === JSON.stringify(canonicalize(defaultMinima()))
          const includeAllMatchesDefault = savedIncludeAll === false
          const notePresent = typeof parsed.note === 'string' && parsed.note.trim().length > 0
          const essentiallyDefault = cfgs.length === 0 && metasetsMatchDefaults && minimaMatchDefaults && includeAllMatchesDefault && !notePresent
          if (essentiallyDefault) { setAutosaveReady(true); return }
          const draft = {
            Version: String((data as Record<string, unknown>)['Version'] ?? ''),
            Metasets: savedMetasets,
            Minima: savedMinima,
            Configs: cfgs,
            IncludeAllExplicitMeta: savedIncludeAll,
            ...(parsed.selectedIndex != null ? { SelectedConfigIndex: parsed.selectedIndex } : {}),
            ...(parsed.note ? { Note: parsed.note } : {}),
          }
          setRestoreDraft(draft)
          loadedAutosaveRef.current = draft
          setRestoreDlgOpen(true)
          // Defer autosave until user chooses restore/dismiss
          return
        }
    } catch {}
    // No valid autosave to restore; enable autosave immediately
    setAutosaveReady(true)
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If user dismissed restore, don't overwrite autosave until state diverges from what was saved
  useEffect(() => {
    if (autosaveReady) return
    if (!loadedAutosaveRef.current) return
    try {
      const cur = {
        Version: APP_VERSION,
        Metasets: metasets,
        Minima: minima,
        Configs: customCfgs,
        IncludeAllExplicitMeta: includeAllExplicitMeta,
        ...(selectedCfgIdx != null ? { SelectedConfigIndex: selectedCfgIdx } : {}),
        ...(hsfrNote && hsfrNote.trim() ? { Note: hsfrNote } : {}),
      }
      const curStr = JSON.stringify(cur)
      const baseStr = JSON.stringify(loadedAutosaveRef.current)
      if (curStr !== baseStr) setAutosaveReady(true)
    } catch {}
  }, [metasets, minima, customCfgs, includeAllExplicitMeta, selectedCfgIdx, hsfrNote, autosaveReady])

  // Build autosave payload and keep a ref for synchronous flush on unload
  const autosavePayload = useMemo(() => buildHsfrPayload({
    version: APP_VERSION,
    metasets,
    minima,
    configs: customCfgs,
    includeAllExplicitMeta,
    selectedConfigIndex: selectedCfgIdx,
    ...(hsfrNote && hsfrNote.trim() ? { note: hsfrNote } : {}),
  }), [metasets, minima, customCfgs, includeAllExplicitMeta, selectedCfgIdx, hsfrNote])
  const autosaveRef = useRef<typeof autosavePayload | null>(null)
  const autosaveInitSkipRef = useRef<boolean>(false)
  // Listen for child chip open-copy-dialog to open manual copy UI
  useEffect(() => {
    const onOpen = (e: Event) => {
      try {
        const detail = (e as CustomEvent<string>).detail
        if (typeof detail === 'string') { setCopyText(detail); setCopyDlgOpen(true) }
      } catch {}
    }
    window.addEventListener(COPY_DIALOG_EVENT, onOpen as EventListener)
    return () => window.removeEventListener(COPY_DIALOG_EVENT, onOpen as EventListener)
  }, [])
  // When copy dialog opens, preselect text for native copy (Ctrl/Cmd+C)
  useEffect(() => {
    if (!copyDlgOpen) return
    const t = window.setTimeout(() => {
      try {
        const el = copyInputRef.current
        if (el && typeof (el as HTMLInputElement).select === 'function') (el as HTMLInputElement).select()
      } catch {}
    }, 0)
    return () => clearTimeout(t)
  }, [copyDlgOpen])
  useLayoutEffect(() => {
    // Skip the initial mount write to avoid clobbering an existing autosave
    if (!autosaveInitSkipRef.current) { autosaveInitSkipRef.current = true; return }
    try { autosaveRef.current = autosavePayload; saveAutosave(AUTOSAVE_KEY, autosavePayload) } catch {}
  }, [autosavePayload])
  useEffect(() => {
    const flush = () => { try { const cur = autosaveRef.current; if (cur) saveAutosave(AUTOSAVE_KEY, cur) } catch {} }
    const onVis = () => { if (document.hidden) flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // Global drag & drop: allow dropping .hsfr or .hsf anywhere in the UI.
  // Show an overlay during file drags. Only intercept real file drags so
  // component-level drags (e.g., column reorder) continue to work.
  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean => {
      try { return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files') } catch { return false }
    }
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      fileDragCounterRef.current = Math.max(0, fileDragCounterRef.current) + 1
      setFileDragActive(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      // keep overlay on while dragging over
      if (!fileDragActive) setFileDragActive(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      fileDragCounterRef.current = Math.max(0, fileDragCounterRef.current - 1)
      if (fileDragCounterRef.current === 0) setFileDragActive(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      fileDragCounterRef.current = 0
      setFileDragActive(false)
      const dt = e.dataTransfer
      const file = dt && dt.files && dt.files[0]
      if (!file) return
      const name = String(file.name || '').toLowerCase()
      ;(async () => {
        try {
          if (name.endsWith('.hsfr')) {
            // HSFR: configs, metasets, minima, includeAllExplicitMeta, and selection index
            const { cfgs, metasets: nextMetas, minima: nextMinima, includeAllExplicitMeta: nextAllExplicit, selectedIndex, note } = await readHsfrFile(file, { metasets, minima, includeAllExplicitMeta })
            setCustomCfgs(cfgs)
            if (nextMetas !== metasets) setMetasets(nextMetas)
            if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
            if (nextAllExplicit !== includeAllExplicitMeta) setIncludeAllExplicitMeta(nextAllExplicit)
            const sel = selectedIndex
            setSelectedCfgIdx(sel)
            if (sel !== null && cfgs[sel]) setBuilder(cfgs[sel]!)
            if (note && String(note).trim()) { setHsfrNote(String(note)); setNoteMode('view'); setNoteOpen(true) } else { setHsfrNote(null); setNoteOpen(false) }
            try { setLastSavedSig(JSON.stringify({ customCfgs: cfgs, metasets: nextMetas, minima: nextMinima, includeAllExplicitMeta: nextAllExplicit })) } catch {}
          } else if (name.endsWith('.hsf')) {
            // HSF: base sellfile preview/merge
            const parsed = await readHsfFile(file)
            setHsf(parsed)
          } else {
            // Unsupported extension for global drop; ignore to avoid surprises
            console.warn('Ignored dropped file with unsupported extension:', name)
          }
        } catch (err) {
          console.error('Failed to parse dropped file', err)
        }
      })()
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [metasets, minima, includeAllExplicitMeta, setMinima, fileDragActive])

  

  async function onHsfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const inputEl = e.target as HTMLInputElement
    const file = inputEl.files?.[0]
    if (!file) return
    try {
      const parsed = await readHsfFile(file)
      setHsf(parsed)
    } catch (err) {
      console.error('Failed to parse .hsf file', err)
      setHsf(null)
    } finally { try { inputEl.value = '' } catch {} }
  }

  // Bitmap icon for Manage Colors: generated via canvas at runtime
  const colorIconSrc = React.useMemo(() => {
    try {
      const c = document.createElement('canvas')
      c.width = 24; c.height = 24
      const ctx = c.getContext('2d')
      if (!ctx) return ''
      ctx.clearRect(0, 0, 24, 24)
      const colors = ['#8BC34A','#FF7043','#64B5F6','#BA68C8','#FFD54F','#80CBC4']
      let i = 0
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 3; x++) {
          ctx.fillStyle = colors[i++]!
          ctx.fillRect(3 + x*7, 4 + y*8, 6, 6)
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.strokeRect(2.5, 3.5, 19, 17)
      return c.toDataURL('image/png')
    } catch { return '' }
  }, [])

  return (
    <Container maxWidth="xl" sx={{ pt: 1.5, pb: 1.5 }}>
      {/* Full-screen, non-interactive overlay shown while dragging files over the app.
          We keep pointerEvents: 'none' so drops still reach the window handler. */}
      {fileDragActive && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            pointerEvents: 'none',
            bgcolor: 'rgba(15,15,18,0.6)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              pointerEvents: 'none',
              px: 3,
              py: 2,
              borderRadius: 2,
              bgcolor: 'rgba(30,30,36,0.9)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: 6,
              textAlign: 'center',
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Drop file to load</Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Accepts .hsfr (configs + metasets) and .hsf (sellfile)
            </Typography>
          </Box>
        </Box>
      )}
      <GlobalStyles styles={(theme) => ({
        '*, *::before, *::after': {
          scrollbarWidth: 'thin',
          scrollbarColor: `${theme.palette.divider} transparent`,
        },
        // Hide MUI tooltips while scrolling to avoid viewport scrollbar flicker
        '.scrolling .MuiTooltip-popper': {
          display: 'none !important',
        },
        '::-webkit-scrollbar': {
          width: 10,
          height: 10,
        },
        '::-webkit-scrollbar-track': {
          backgroundColor: theme.palette.background.paper,
        },
        '::-webkit-scrollbar-thumb': {
          backgroundColor: theme.palette.divider,
          borderRadius: 8,
          border: `2px solid ${theme.palette.background.paper}`,
        },
        '::-webkit-scrollbar-thumb:hover': {
          backgroundColor: theme.palette.text.disabled,
        },
        'input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button': {
          WebkitAppearance: 'auto',
          margin: 0,
          opacity: 0.7,
          filter: theme.palette.mode === 'dark' ? 'invert(0.8)' : 'none',
        },
      })} />
      <Box
        sx={{
          mb: 1,
          width: '100%',
          maxWidth: 1152,
          mx: 'auto',
          '@media (min-width:2320px)': {
            position: 'relative',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '2320px',
            maxWidth: 'none',
            mx: 0,
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
            flexWrap: 'wrap',
            width: '100%',
            maxWidth: 1152,
            '@media (min-width:2320px)': {
              // Anchor to the left edge of the two-column grid; only span the left panel width
              gridColumn: '1 / span 1',
            },
          }}
        >
          <Typography variant="h4" fontWeight={700} sx={{ whiteSpace: 'nowrap', fontSize: '2rem' }}>RSL Helper Sellfile Creator</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '9.5px', lineHeight: 1.15, textAlign: 'right' }}>
              v{APP_VERSION} — Build and preview sell files for RSL Helper. Made by [STBL] Nusi㊷
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0, fontSize: '9.5px', lineHeight: 1.15, textAlign: 'right' }}>
              Unofficial, fan-made tool — not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0, fontSize: '9.5px', lineHeight: 1.15, textAlign: 'right' }}>
              Many thanks to [STBL] Nasgor and [SP] Panda for their invaluable contributions! — Remember: Bleibt Stabil!
            </Typography>
          </Box>
        </Box>
      </Box>

      

      <Stack spacing={2}>
        {/* Original vertical layout; pairs side-by-side only when viewport >= 2304px */}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            // default: contained width with normal stacking
            '@media (min-width:2320px)': {
              // Center the pair relative to the viewport without Container influence
              // 1152 + 16 gap + 1152 = 2320
              position: 'relative',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '2320px',
              gridTemplateColumns: '1152px 1152px',
              columnGap: '16px',
              alignItems: 'start',
            },
          }}
        >
        <Paper ref={leftPaperRef} sx={{ p: 2, width: '100%', maxWidth: 1152, mx: 'auto', '@media (min-width:2320px)': { mx: 0, width: 1152 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', columnGap: 1, mb: 1.25 }}>
            <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>Add Configs and Rules</Typography>
            <Typography variant="caption" color="text.secondary">Use the builder below to define rules and add them to your custom set. You can also load/save your custom rules (HSFR), including metasets, and manage them right here.</Typography>
          </Box>
          <BuilderPanel
              cfg={builder}
              onChange={setBuilder}
            onAddToCustom={() => {
              setCustomCfgs(prev => {
                const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
                  ? selectedCfgIdx + 1
                  : prev.length
                const next = [...prev.slice(0, insertIdx), builder, ...prev.slice(insertIdx)]
                // Auto-select the newly added config chip
                setSelectedCfgIdx(insertIdx)
                return next
              })
            }}
            editingIndex={selectedCfgIdx}
            onUpdateSelected={() => {
              if (selectedCfgIdx === null) return
              setCustomCfgs(prev => prev.map((c, i) => (i === selectedCfgIdx ? builder : c)))
            }}
            metasets={metasets}
            onMetasetsChange={(next) => setMetasets(next)}
            onDeleteMetaset={(id) => {
              setMetasets(prev => prev.filter(m => m.id !== id))
              setCustomCfgs(prev => prev.map(c => ({
                ...c,
                artifactMetaSets: (c.artifactMetaSets ?? []).filter(x => x !== id)
              })))
            }}
            minima={minima}
            onMinimaChange={setMinima}
            includeAllExplicitMeta={includeAllExplicitMeta}
            onIncludeAllExplicitMetaChange={setIncludeAllExplicitMeta}
              setUsageCounts={setUsageCounts}
              metasetUsageCounts={metasetUsageCounts}
            />
          {/* Merged: Custom Rules (HSFR) controls */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, flexWrap: 'nowrap' }}>
            <Button component="label" startIcon={<UploadFileIcon />} onClick={() => { try { setLastSavedSig(currentConfigSig) } catch {} }}>
              Load Configs (.hsfr)
              <input
                hidden
                type="file"
                accept=".hsfr,application/json"
                onChange={(e) => {
                  const inputEl = e.target as HTMLInputElement
                  const file = inputEl.files?.[0]
                  if (!file) return
                  ;(async () => {
                    try {
                      const { cfgs, metasets: nextMetas, minima: nextMinima, includeAllExplicitMeta: nextAllExplicit, selectedIndex, note } = await readHsfrFile(file, { metasets, minima, includeAllExplicitMeta })
                      setCustomCfgs(cfgs)
                      if (nextMetas !== metasets) setMetasets(nextMetas)
                      if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
                      if (nextAllExplicit !== includeAllExplicitMeta) setIncludeAllExplicitMeta(nextAllExplicit)
                      const sel = selectedIndex
                      setSelectedCfgIdx(sel)
                      if (sel !== null && cfgs[sel]) setBuilder(cfgs[sel]!)
                      // HSFR Note handling: set and auto-open if present
                      if (note && String(note).trim()) { setHsfrNote(String(note)); setNoteMode('view'); setNoteOpen(true) } else { setHsfrNote(null); setNoteOpen(false) }
                      try { setLastSavedSig(JSON.stringify({ customCfgs: cfgs, metasets: nextMetas, minima: nextMinima, includeAllExplicitMeta: nextAllExplicit })) } catch {}
                    } catch (err) {
                      console.error('Failed to parse .hsfr file', err)
                    } finally { try { inputEl.value = '' } catch {} }
                  })()
                }}
              />
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              startIcon={<SaveIcon />}
              onClick={() => {
                // Build HSFR payload via IO helper and download
                const payload = buildHsfrPayload({
                  version: APP_VERSION,
                  metasets,
                  minima,
                  configs: customCfgs,
                  includeAllExplicitMeta,
                  selectedConfigIndex: selectedCfgIdx,
                  ...(hsfrNote ? { note: hsfrNote } : {}),
                })
                const blob = hsfrToBlob(payload)
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                const d = new Date()
                const p = (n: number) => String(n).padStart(2, '0')
                const ts = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
                a.href = url
                a.download = `SellfileCreatorRules_${ts}.hsfr`
                a.click()
                URL.revokeObjectURL(url)
                try { setToastMsg('Configs saved. Check your Downloads folder.'); setToastOpen(true) } catch {}
                try { setLastSavedSig(currentConfigSig) } catch {}
              }}
              // Always enabled: allow saving even with zero configs
              disabled={false}
            >
              Save Configs (.hsfr)
            </Button>
            <Button
              color="error"
              onMouseEnter={() => setHoverDeleteConfigs(true)}
              onMouseLeave={() => setHoverDeleteConfigs(false)}
              onClick={() => setConfirmClearOpen(true)}
              disabled={!customCfgs.length}
            >
              Delete Configs
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => { setNoteMode('edit'); setNoteOpen(true) }}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {hsfrNote && hsfrNote.trim() ? 'Edit Note' : 'Add Note'}
            </Button>
            <Chip label={`${customCfgs.length} config(s)`} size="small" />
          </Stack>
          <Box
            ref={chipsContainerRef}
            sx={(theme) => ({
              mt: 2,
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              maxHeight: 220,
              overflowY: 'auto',
              overflowX: 'hidden',
              pr: 1,
              minHeight: 40,
              // Important: keep lines pinned to the top when content overflows,
              // otherwise alignContent can cause the first row to render partially hidden.
              alignContent: customCfgs.length === 0 ? 'center' : 'flex-start',
              position: 'relative',
              transition: 'background-color 220ms ease-in-out 60ms',
              backgroundColor: hoverDeleteConfigs
                ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)')
                : 'transparent',
            })}
            onContextMenu={(e) => {
              e.preventDefault();
              setChipAreaMenu({ open: true, x: e.clientX, y: e.clientY })
            }}
          >
            {customCfgs.length === 0 ? (
              <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
                <Typography variant="caption">No configs yet — right-click to Paste</Typography>
              </Box>
            ) : (
              customCfgs.map((c, idx) => (
                <ConfigChip
                  key={idx}
                  index={idx}
                  cfg={c}
                  metasets={metasets}
                  selected={selectedCfgIdx === idx}
                  onSelect={() => { setSelectedCfgIdx(idx); setBuilder(c!) }}
                  onDelete={() => setConfirmDeleteIdx(idx)}
                  onDuplicate={() => setCustomCfgs(prev => {
                    const copy = { ...c }
                    const insertIdx = insertIndexAfter(prev, idx)
                    return [...prev.slice(0, insertIdx), copy, ...prev.slice(insertIdx)]
                  })}
                  onPasteAfter={() => { pasteAfterIndex(idx) }}
                  onMoveUp={() => setCustomCfgs(prev => {
                    if (idx === 0) return prev
                    const arr = [...prev]
                    if (!arr[idx-1] || !arr[idx]) return prev
                    const tmp = arr[idx-1]!; arr[idx-1] = arr[idx]!; arr[idx] = tmp
                    // update selection if affected
                    setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx - 1 : sel === idx - 1 ? idx : sel)
                    return arr
                  })}
                  onMoveDown={() => setCustomCfgs(prev => {
                    if (idx === prev.length - 1) return prev
                    const arr = [...prev]
                    if (!arr[idx+1] || !arr[idx]) return prev
                    const tmp = arr[idx+1]!; arr[idx+1] = arr[idx]!; arr[idx] = tmp
                    setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx + 1 : sel === idx + 1 ? idx : sel)
                    return arr
                  })}
                  onMoveTop={() => setCustomCfgs(prev => {
                    if (idx === 0) return prev
                    const arr = [...prev]
                    const m = arr[idx]
                    if (!m) return prev
                    arr.splice(idx, 1)
                    arr.unshift(m)
                    setSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? 0 : (sel < idx ? sel : sel)))
                    return arr
                  })}
                  onMoveBottom={() => setCustomCfgs(prev => {
                    if (idx === prev.length - 1) return prev
                    const arr = [...prev]
                    const m = arr[idx]
                    if (!m) return prev
                    arr.splice(idx, 1)
                    arr.push(m)
                    setSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? arr.length - 1 : (sel > idx ? sel : sel)))
                    return arr
                  })}
                  isLast={idx === customCfgs.length - 1}
                  linkedHover={hoveredCfgIdx !== null && hoveredCfgIdx === idx}
                  onHover={(enter) => setHoveredCfgIdx(enter ? idx : null)}
                />
              ))
            )}
          </Box>
          {/* Chips area context menu */}
          <Menu
            open={Boolean(chipAreaMenu?.open)}
            onClose={() => setChipAreaMenu(null)}
            anchorReference="anchorPosition"
        {...(chipAreaMenu?.open ? { anchorPosition: { top: chipAreaMenu.y, left: chipAreaMenu.x } } : {})}
          >
            <MenuItem
              onClick={async () => {
                const payload = buildHsfrPayload({
                  version: APP_VERSION,
                  metasets,
                  minima,
                  configs: customCfgs,
                  includeAllExplicitMeta,
                  selectedConfigIndex: selectedCfgIdx,
                  ...(hsfrNote && hsfrNote.trim() ? { note: hsfrNote } : {}),
                })
                const text = JSON.stringify(payload, null, 2)
                const ok = await writeTextSafe(text)
                setChipAreaMenu(null)
                if (!ok) { setCopyText(text); setCopyDlgOpen(true) }
              }}
              disabled={customCfgs.length === 0}
            >Copy all Configs</MenuItem>
            <MenuItem
              onClick={async () => {
                const text = await readTextSafe()
                if (text && text.trim()) {
                  try {
                    const { cfgs, note } = parseHsfrText(text, { metasets, minima, includeAllExplicitMeta })
                    if (cfgs.length > 0) {
                      const preLen = customCfgs.length
                      setCustomCfgs(prev => [...prev, ...cfgs])
                      if ((!hsfrNote || !hsfrNote.trim()) && typeof note === 'string' && note.trim()) {
                        setHsfrNote(note)
                      }
                      try {
                        const sel = preLen + cfgs.length - 1
                        setSelectedCfgIdx(sel)
                        setBuilder(cfgs[cfgs.length - 1]!)
                      } catch {}
                      setChipAreaMenu(null)
                      return
                    }
                  } catch {}
                  const cfgs = parseConfigsFromText(text, metasets)
                  if (cfgs.length > 0) {
                    const preLen = customCfgs.length
                    setCustomCfgs(prev => [...prev, ...cfgs])
                    try {
                      const sel = preLen + cfgs.length - 1
                      setSelectedCfgIdx(sel)
                      setBuilder(cfgs[cfgs.length - 1]!)
                    } catch {}
                    setChipAreaMenu(null)
                    return
                  }
                }
                // Fallback to manual paste dialog: paste at end and select last if empty
                setChipAreaMenu(null)
                setSelectedCfgIdx(null)
                setPasteSelectOnEmpty(true)
                setPasteText('')
                setPasteErr(null)
                setPasteDlgOpen(true)
              }}
            >Paste at End</MenuItem>
          </Menu>

          <PasteDialog
            open={pasteDlgOpen}
            text={pasteText}
            error={pasteErr}
            onTextChange={(v) => { setPasteText(v); setPasteErr(null) }}
            onCancel={() => setPasteDlgOpen(false)}
            onConfirm={() => {
              const preLen = customCfgs.length
              const parsed = parseConfigsFromText(pasteText, metasets)
              const ok = handlePasteText(pasteText)
              if (ok) {
                if (pasteAfterIdx !== null && parsed.length > 0) {
                  try {
                    setSelectedCfgIdx(pasteAfterIdx + parsed.length)
                    setBuilder(parsed[parsed.length - 1]!)
                  } catch {}
                  setPasteAfterIdx(null)
                } else if (pasteSelectOnEmpty && parsed.length > 0) {
                  try {
                    const sel = preLen + parsed.length - 1
                    setSelectedCfgIdx(sel)
                    setBuilder(parsed[parsed.length - 1]!)
                  } catch {}
                }
                setPasteSelectOnEmpty(false)
                setPasteDlgOpen(false)
              }
            }}
            confirmLabel={selectedCfgIdx !== null ? 'Insert after selected' : 'Add to end'}
          />

          <CopyDialog
            open={copyDlgOpen}
            text={copyText}
            inputRef={copyInputRef}
            onTextChange={setCopyText}
            onClose={() => setCopyDlgOpen(false)}
          />
        </Paper>

        <Paper sx={{ p: 2, width: '100%', maxWidth: 1152, mx: 'auto', display: 'flex', flexDirection: 'column',
          '@media (min-width:2320px)': { mx: 0, width: 1152, height: leftHeight || 'auto', overflow: 'hidden' }
        }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6">Preview</Typography>
        <Chip label={`${mergedRules.length} total rule(s)`} size="small" />
        <Tooltip title="Manage Colors">
          <IconButton size="small" onClick={() => setColorsDlgOpen(true)} aria-label="Manage colors">
            <img src={colorIconSrc} width={18} height={18} alt="Manage Colors" style={{ display: 'block' }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Optional: Load your existing RSL Helper sell file to preview how your new rules merge with it. You can skip this and still build and export rules from scratch.
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'nowrap' }}>
        <Button component="label" startIcon={<UploadFileIcon />}>
          Load RSL Helper Sellfile
          <input hidden type="file" accept=".hsf,application/json" onChange={onHsfUpload} />
        </Button>
        <Button color="warning" onClick={() => setHsf(null)} disabled={!hsf}>Clear</Button>
        {hsf && (
          <Typography noWrap variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {`Loaded ${hsf.Rules.length} base ${hsf.Rules.length === 1 ? 'rule' : 'rules'}`}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
              startIcon={<SaveIcon />}
              sx={{ whiteSpace: 'nowrap', px: 1.25 }}
              onClick={() => {
                // Build HSF file from merged rules via IO helpers and download
                const file: HsfFile = buildHsfFileFromMerged(mergedRules as (HsfRule & { __cfgIdx?: number })[])
                const blob = hsfToBlob(file)
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                const d = new Date()
                const p = (n: number) => String(n).padStart(2, '0')
                const ts = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
                a.href = url
                a.download = `Sellfile_${ts}.hsf`
                a.click()
                URL.revokeObjectURL(url)
                try { setToastMsg('Sellfile saved. Check your Downloads folder.'); setToastOpen(true) } catch {}
              }}
              disabled={!mergedRules.length}
            >
              {hsf ? 'Export merged RSL Helper Sellfile' : 'Export RSL Helper Sellfile'}
            </Button>
          </Stack>
          {mergedRules.length ? (
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <HsfRulesTableMemo
               rules={mergedRules}
               hoveredCfgIdx={hoveredCfgIdx}
               setHoveredCfgIdx={setHoveredCfgIdx}
               selectedCfgIdx={selectedCfgIdx}
               onSelectCfgIdx={(idx) => {
                 // Guard against invalid indices to avoid crashes
                 setSelectedCfgIdx((prev) => (idx >= 0 && idx < customCfgs.length ? idx : prev))
                 if (idx >= 0 && idx < customCfgs.length && customCfgs[idx]) {
                   setBuilder(customCfgs[idx]!)
                 }
               }}
               onConfigAction={async (idx, action) => {
                if (action === 'duplicate') {
                  setCustomCfgs(prev => {
                    const base = prev[idx]
                    if (!base) return prev
                    const copy: BuilderConfig = { ...base }
                    const arr = [...prev]
                    const insertIdx = insertIndexAfter(arr, idx)
                    arr.splice(insertIdx, 0, copy)
                    return arr
                  })
                  return
                }
                if (action === 'delete') {
                  setCustomCfgs(prev => prev.filter((_, i) => i !== idx))
                  setSelectedCfgIdx((sel) => {
                    if (sel === null) return sel
                    if (sel === idx) return null
                    if (sel > idx) return sel - 1
                    return sel
                  })
                  return
                }
                if (action === 'copy') {
                  try {
                    const cfg = customCfgs[idx]
                    if (!cfg) return
                    const readable = buildReadableConfig(cfg, metasets)
                    const text = JSON.stringify(readable, null, 2)
                    const ok = await writeTextSafe(text)
                    if (!ok) { setCopyText(text); setCopyDlgOpen(true) }
                  } catch {}
                  return
                }
                if (action === 'paste_after') {
                  await pasteAfterIndex(idx)
                  return
                }
                if (action === 'move_top') {
                  setCustomCfgs(prev => {
                    if (idx === 0) return prev
                    const arr = [...prev]
                    const m = arr[idx]
                    if (!m) return prev
                    arr.splice(idx, 1)
                    arr.unshift(m)
                    setSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? 0 : (sel < idx ? sel : sel)))
                    return arr
                  })
                  return
                }
                if (action === 'move_bottom') {
                  setCustomCfgs(prev => {
                    if (idx === prev.length - 1) return prev
                    const arr = [...prev]
                    const m = arr[idx]
                    if (!m) return prev
                    arr.splice(idx, 1)
                    arr.push(m)
                    setSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? arr.length - 1 : (sel > idx ? sel : sel)))
                    return arr
                  })
                  return
                }
                if (action === 'move_up') {
                  setCustomCfgs(prev => {
                    if (idx === 0) return prev
                    const arr = [...prev]
                    if (!arr[idx-1] || !arr[idx]) return prev
                    const tmp = arr[idx-1]!; arr[idx-1] = arr[idx]!; arr[idx] = tmp
                    setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx - 1 : sel === idx - 1 ? idx : sel)
                    return arr
                  })
                  return
                }
                if (action === 'move_down') {
                  setCustomCfgs(prev => {
                    if (idx === prev.length - 1) return prev
                    const arr = [...prev]
                    if (!arr[idx+1] || !arr[idx]) return prev
                    const tmp = arr[idx+1]!; arr[idx+1] = arr[idx]!; arr[idx] = tmp
                    setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx + 1 : sel === idx + 1 ? idx : sel)
                    return arr
                  })
                  return
                }
              }}
              onClearBase={() => setHsf(null)}
               substatColors={substatColors}
              />
            </Box>
          ) : null}
        </Paper>
        </Box>

      </Stack>
      <NoteDialog
        open={noteOpen}
        mode={noteMode}
        note={hsfrNote ?? ''}
        onChange={(v) => setHsfrNote(v)}
        onClose={() => setNoteOpen(false)}
      />
      <Snackbar
        open={toastOpen}
        autoHideDuration={3000}
        onClose={() => setToastOpen(false)}
        // True center of the viewport
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{
          '&.MuiSnackbar-root': {
            left: '50% !important',
            top: '50% !important',
            transform: 'translate(-50%, -50%)',
          },
        }}
      >
        <Alert
          icon={<SaveIcon fontSize="inherit" />}
          severity="success"
          variant="filled"
          onClose={() => setToastOpen(false)}
          sx={{
            alignItems: 'center',
            fontSize: 16,
            px: 2.5,
            py: 1.5,
            minWidth: 360,
          }}
        >
          {toastMsg}
        </Alert>
      </Snackbar>
      <ConfirmDialogs
        openClear={confirmClearOpen}
        setOpenClear={setConfirmClearOpen}
        onConfirmClear={() => { setCustomCfgs([]); setSelectedCfgIdx(null) }}
        deleteIdx={confirmDeleteIdx}
        setDeleteIdx={setConfirmDeleteIdx}
        onConfirmDelete={() => {
          if (confirmDeleteIdx === null) return
          setCustomCfgs(prev => prev.filter((_, i) => i !== confirmDeleteIdx))
          setSelectedCfgIdx((sel) => {
            if (sel === null) return sel
            if (sel === confirmDeleteIdx) return null
            if (sel > confirmDeleteIdx) return sel - 1
            return sel
          })
        }}
      />
      {/* Restore autosaved HSFR dialog */}
      <Dialog open={restoreDlgOpen} onClose={() => setRestoreDlgOpen(false)}>
        <DialogTitle>Restore last saved configuration?</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography variant="body2">
              An autosaved session was found. Would you like to restore it?
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Configs: {restoreDraft?.Configs?.length ?? 0} • Metasets: {restoreDraft?.Metasets?.length ?? 0} • Note: {restoreDraft?.Note && restoreDraft.Note.trim() ? 'Yes' : 'No'}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            color="error"
            onClick={() => {
              setRestoreDlgOpen(false)
              // Enable autosave immediately even if user makes no changes
              // so the last-used state keeps being persisted.
              setAutosaveReady(true)
              loadedAutosaveRef.current = null
            }}
          >
            Dismiss
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (restoreDraft) {
                if (Array.isArray(restoreDraft.Metasets)) setMetasets(restoreDraft.Metasets)
                if (restoreDraft.Minima && typeof restoreDraft.Minima === 'object') setMinima(restoreDraft.Minima)
                if (Array.isArray(restoreDraft.Configs)) setCustomCfgs(restoreDraft.Configs)
                setIncludeAllExplicitMeta(Boolean(restoreDraft.IncludeAllExplicitMeta))
                if (typeof restoreDraft.Note === 'string') setHsfrNote(restoreDraft.Note)
                const len = restoreDraft.Configs?.length ?? 0
                if (len > 0) {
                  const savedSel = typeof restoreDraft.SelectedConfigIndex === 'number' ? restoreDraft.SelectedConfigIndex : (len - 1)
                  const sel = savedSel >= 0 && savedSel < len ? savedSel : len - 1
                  setSelectedCfgIdx(sel)
                  try {
                    const cfgs = (restoreDraft.Configs || [])
                    if (cfgs[sel]) setBuilder(cfgs[sel]!)
                  } catch {}
                } else {
                  setSelectedCfgIdx(null)
                }
              }
              setRestoreDlgOpen(false)
              // After restoring, we can enable autosave immediately
              setAutosaveReady(true)
              loadedAutosaveRef.current = null
            }}
          >
            Restore
          </Button>
        </DialogActions>
      </Dialog>
      {/* Manage Colors Dialog */}
      <Dialog open={colorsDlgOpen} onClose={() => setColorsDlgOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Substat Chip Colors</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Choose colors per substat.
          </Typography>
          <Stack spacing={1.25}>
            {[
              { id: StatId.HP, isFlat: true, label: 'HP' },
              { id: StatId.HP, isFlat: false, label: 'HP%' },
              { id: StatId.ATK, isFlat: true, label: 'ATK' },
              { id: StatId.ATK, isFlat: false, label: 'ATK%' },
              { id: StatId.DEF, isFlat: true, label: 'DEF' },
              { id: StatId.DEF, isFlat: false, label: 'DEF%' },
              { id: StatId.SPD, isFlat: true, label: 'SPD' },
              { id: StatId.RES, isFlat: true, label: 'RES' },
              { id: StatId.ACC, isFlat: true, label: 'ACC' },
              { id: StatId.CR, isFlat: false, label: 'CR%' },
              { id: StatId.CDMG, isFlat: false, label: 'CDMG%' },
            ].map((row) => {
              const vk = subToVariant(row.id, row.isFlat)
              const fg = (substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? '#90CAF9') as string
              const bg = (substatColors[vk]?.bg ?? DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[vk] ?? '#E3F2FD') as string
              return (
                <Box key={`row-${vk}`} sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ minWidth: 120 }}>{row.label}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                    <ColorField value={fg} onChange={(v) => setSubstatColors(prev => ({ ...prev, [vk]: { fg: v, bg } }))} label="Text" />
                    <ColorField value={bg} onChange={(v) => setSubstatColors(prev => ({ ...prev, [vk]: { fg, bg: v } }))} label="Bg" />
                    <MuiChip size="small" label={row.label} variant="outlined" sx={{ height: 18, borderColor: fg, color: fg, bgcolor: bg, '& .MuiChip-label': { px: 0.75, py: 0, fontSize: 11 } }} />
                  </Box>
                </Box>
              )
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button size="small" variant="outlined" color="error" onClick={() => setSubstatColors(defaultSubstatColorMapV5())}>Reset to defaults</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setColorsDlgOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}
