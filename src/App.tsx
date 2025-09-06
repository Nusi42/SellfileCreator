/**
 * App
 *
 * Top-level React component that orchestrates:
 * - Base HSF load/preview/merge and export
 * - HSFR (custom rules) load/save/copy and state management
 * - Rule builder UI, metasets, minima, and autosave
 * - Color management for substat chips and various dialogs
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { APP_VERSION } from './version'
import { readHsfFile, buildHsfFileFromMerged, hsfToBlob } from './lib/hsfIO'
import { artifactSetNames } from './lib/types'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { type BuilderConfig, defaultMinima, type MinimaTable } from './lib/hsfBuilder'
import { type Metaset, defaultMetasets } from './lib/metasets'
import { parseConfigsFromText, buildReadableConfig, readHsfrFile, parseHsfrObject, buildHsfrPayload, hsfrToBlob, parseHsfrText } from './lib/hsfrIO'
import { COPY_DIALOG_EVENT, writeTextSafe, readTextSafe } from './lib/clipboard'
import { loadAutosave } from './lib/autosave'
import { AUTOSAVE_KEY, STAT_BUTTON_BORDERS_KEY, PANEL_WIDTH_PX, SIDE_BY_SIDE_BREAKPOINT_PX, GRID_COLUMN_GAP_PX } from './lib/constants'
// (Removed local CRC32; autosave utils provide it.)

import { Box, Container, Paper, Stack, Typography, GlobalStyles } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import { Snackbar, Alert } from '@mui/material'
// Icons for App header and controls are imported within components that use them
// ColorField moved into ManageColorsDialog; not used directly here
import { HsfRulesTableMemo } from './components/HsfRulesTable'
// Chips list panel (extracted)
import ConfigChipsPanel from './components/ConfigChipsPanel'
import ConfirmDialogs from './components/ConfirmDialogs'
import BuilderPanel from './components/BuilderPanel'
import CopyDialog from './components/CopyDialog'
import PasteDialog from './components/PasteDialog'
// Markdown preview for HSFR Note (read-only). Requires installation:
//   npm i @uiw/react-md-editor rehype-sanitize @uiw/react-markdown-preview
// Styles are imported globally here.
// If the deps are missing, the app will fail to compile; install them as above.
import NoteDialog from './components/NoteDialog'
import { useSubstatColors, defaultSubstatColorMapV5 } from './hooks/useSubstatColors'
import { computeMergedRules } from './lib/merge'
import FileDragOverlay from './components/FileDragOverlay'
import { useFileDragDrop } from './hooks/useFileDragDrop'
import HeaderActions from './components/HeaderActions'
import ManageColorsDialog from './components/dialogs/ManageColorsDialog'
import RestoreAutosaveDialog from './components/dialogs/RestoreAutosaveDialog'
import { useAutosave } from './hooks/useAutosave'
import PreviewHeaderActions from './components/PreviewHeaderActions'

// Components are organized under src/components

export default function App() {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  const [customCfgs, setCustomCfgs] = useState<BuilderConfig[]>([])
  // Storage keys are centralized in src/lib/constants to keep behavior consistent
  const [restoreDlgOpen, setRestoreDlgOpen] = useState(false)
  const [restoreDraft, setRestoreDraft] = useState<null | { Version?: string; Metasets?: Metaset[]; Minima?: MinimaTable; Configs?: BuilderConfig[]; IncludeAllExplicitMeta?: boolean; SelectedConfigIndex?: number; Note?: string }>(null)
  const [autosaveReady, setAutosaveReady] = useState(false)
  const loadedAutosaveRef = useRef<null | { Version?: string; Metasets?: Metaset[]; Minima?: MinimaTable; Configs?: BuilderConfig[]; IncludeAllExplicitMeta?: boolean; SelectedConfigIndex?: number; Note?: string }>(null)
  // When user dismisses the restore dialog, we capture a baseline snapshot of the
  // current state. Autosave will remain disabled until the state diverges from
  // this baseline (i.e., the user actually edits something), so we don't clobber
  // the previous autosave just by dismissing.
  const dismissBaselineRef = useRef<string | null>(null)
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
  const [substatColors, setSubstatColors] = useSubstatColors()
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
  const [hoverDeleteConfigs] = useState(false)
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
  // Option: color stat button borders using substat colors (default off)
  // Persist builder stat button border preference using the centralized key
  const [statButtonBorders, setStatButtonBorders] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(STAT_BUTTON_BORDERS_KEY)
      return raw === 'true'
    } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem(STAT_BUTTON_BORDERS_KEY, String(statButtonBorders)) } catch {}
  }, [statButtonBorders])
  
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)
  // Chips panel now owns its context menu; no local state here
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
  // Global file-drag overlay and file routing handled by hook
  const { active: fileDragActive } = useFileDragDrop({
    onHsfr: async (file: File) => {
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
    },
    onHsf: async (file: File) => {
      const parsed = await readHsfFile(file)
      setHsf(parsed)
    },
  })
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

  // Merged rules for preview, computed via a pure helper
  const mergedRules = useMemo((): (HsfRule & { __cfgIdx?: number })[] => {
    return computeMergedRules({
      hsf,
      customCfgs,
      metasets,
      minima,
      includeAllExplicitMeta,
    })
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
      if (entry) {
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
      }
    } catch {}
    // No valid autosave to restore; enable autosave immediately
    setAutosaveReady(true)
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If user dismissed restore, don't overwrite autosave until state diverges from the baseline at dismiss
  useEffect(() => {
    if (autosaveReady) return
    // While the dialog is open, never enable autosave (preserve previous snapshot)
    if (restoreDlgOpen) return
    // Only start watching for divergence after dismiss captured a baseline
    if (!dismissBaselineRef.current) return
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
      const baseStr = dismissBaselineRef.current
      if (curStr !== baseStr) setAutosaveReady(true)
    } catch {}
  }, [metasets, minima, customCfgs, includeAllExplicitMeta, selectedCfgIdx, hsfrNote, autosaveReady, restoreDlgOpen])

  // Build autosave payload and write via useAutosave (enabled after restore choice)
  const autosavePayload = useMemo(() => buildHsfrPayload({
    version: APP_VERSION,
    metasets,
    minima,
    configs: customCfgs,
    includeAllExplicitMeta,
    selectedConfigIndex: selectedCfgIdx,
    ...(hsfrNote && hsfrNote.trim() ? { note: hsfrNote } : {}),
  }), [metasets, minima, customCfgs, includeAllExplicitMeta, selectedCfgIdx, hsfrNote])
  useAutosave({ key: AUTOSAVE_KEY, payload: autosavePayload, enabled: autosaveReady })
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
  

  // Drag/drop: handled by useFileDragDrop hook above



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
      <FileDragOverlay active={fileDragActive} />
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
          maxWidth: PANEL_WIDTH_PX,
          mx: 'auto',
          [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: {
            position: 'relative',
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${SIDE_BY_SIDE_BREAKPOINT_PX}px`,
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
            maxWidth: PANEL_WIDTH_PX,
            [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: {
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
            [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: {
              // Center the pair relative to the viewport without Container influence
              // 1152 + 16 gap + 1152 = 2320
              position: 'relative',
              left: '50%',
              transform: 'translateX(-50%)',
              width: `${SIDE_BY_SIDE_BREAKPOINT_PX}px`,
              gridTemplateColumns: `${PANEL_WIDTH_PX}px ${PANEL_WIDTH_PX}px`,
              columnGap: `${GRID_COLUMN_GAP_PX}px`,
              alignItems: 'start',
            },
          }}
        >
        <Paper ref={leftPaperRef} sx={{ p: 2, width: '100%', maxWidth: PANEL_WIDTH_PX, mx: 'auto', [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: { mx: 0, width: PANEL_WIDTH_PX } }}>
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
            onDeleteMetaset={(id, opts) => {
              // Determine replacement strategy before mutating metasets/configs
              const metaToDelete = metasets.find(m => m.id === id) || null
              const replaceWithSets = Boolean(opts?.replaceWithSets && metaToDelete && (metaToDelete.sets.length > 0))
              const replaceWithMetaId = opts?.replaceWithMetaId && opts.replaceWithMetaId !== id ? opts.replaceWithMetaId : null

              // Remove metaset from the list (cheap)
              setMetasets(prev => prev.filter(m => m.id !== id))

              // Update the live builder selection if it referenced this metaset
              const builderUses = (builder.artifactMetaSets ?? []).includes(id)
              if (builderUses) {
                setBuilder(prev => {
                  const currentMeta = prev.artifactMetaSets ?? []
                  if (!currentMeta.includes(id)) return prev
                  let nextMeta = currentMeta.filter(x => x !== id)
                  let nextSets = prev.artifactSets ?? []
                  if (replaceWithSets && metaToDelete) {
                    const merged = new Set<number>(nextSets)
                    for (const s of metaToDelete.sets) merged.add(s)
                    nextSets = Array.from(merged)
                  } else if (replaceWithMetaId) {
                    if (!nextMeta.includes(replaceWithMetaId)) nextMeta = nextMeta.concat(replaceWithMetaId)
                  }
                  return { ...prev, artifactMetaSets: nextMeta, artifactSets: nextSets }
                })
              }

              // If no configs reference this metaset, skip mapping the entire array
              const usedCount = metasetUsageCounts[id] || 0
              if (usedCount === 0) return

              // Update only configs that reference this metaset
              setCustomCfgs(prev => {
                let anyChanged = false
                const next = prev.map(c => {
                  const currentMeta = c.artifactMetaSets ?? []
                  if (!currentMeta.includes(id)) return c
                  anyChanged = true
                  let nextMeta = currentMeta.filter(x => x !== id)
                  let nextSets = c.artifactSets ?? []
                  if (replaceWithSets && metaToDelete) {
                    const merged = new Set<number>(nextSets)
                    for (const s of metaToDelete.sets) merged.add(s)
                    nextSets = Array.from(merged)
                  } else if (replaceWithMetaId) {
                    if (!nextMeta.includes(replaceWithMetaId)) {
                      nextMeta = nextMeta.concat(replaceWithMetaId)
                    }
                  }
                  return { ...c, artifactMetaSets: nextMeta, artifactSets: nextSets }
                })
                return anyChanged ? next : prev
              })
            }}
              minima={minima}
              onMinimaChange={setMinima}
              includeAllExplicitMeta={includeAllExplicitMeta}
              onIncludeAllExplicitMetaChange={setIncludeAllExplicitMeta}
              setUsageCounts={setUsageCounts}
              metasetUsageCounts={metasetUsageCounts}
              substatColors={substatColors}
              hasAnyConfigs={customCfgs.length > 0}
              useStatButtonBorders={statButtonBorders}
            />
          {/* Merged: Custom Rules (HSFR) controls */}
          <HeaderActions
            onAboutToOpenHsfr={() => { try { setLastSavedSig(currentConfigSig) } catch {} }}
            onSelectHsfr={async (file) => {
              try {
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
              } catch (err) {
                console.error('Failed to parse .hsfr file', err)
              }
            }}
            onSaveHsfr={() => {
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
            onDeleteAll={() => setConfirmClearOpen(true)}
            deleteDisabled={!customCfgs.length}
            onOpenNote={() => { setNoteMode('edit'); setNoteOpen(true) }}
            notePresent={Boolean(hsfrNote && hsfrNote.trim())}
            count={customCfgs.length}
          />
          <ConfigChipsPanel
            containerRef={chipsContainerRef}
            configs={customCfgs}
            selectedIndex={selectedCfgIdx}
            metasets={metasets}
            substatColors={substatColors}
            useStatButtonBorders={statButtonBorders}
            hoveredIdx={hoveredCfgIdx}
            onHoverIdx={(i) => setHoveredCfgIdx(i)}
            onSelect={(idx) => { const c = customCfgs[idx]; if (c) { setSelectedCfgIdx(idx); setBuilder(c) } }}
            onDelete={(idx) => setConfirmDeleteIdx(idx)}
            onDuplicate={(idx) => setCustomCfgs(prev => { const c = prev[idx]; if (!c) return prev; const copy = { ...c }; const insertIdx = Math.min(prev.length, idx + 1); return [...prev.slice(0, insertIdx), copy, ...prev.slice(insertIdx)] })}
            onPasteAfter={(idx) => { pasteAfterIndex(idx) }}
            onMoveUp={(idx) => setCustomCfgs(prev => { if (idx === 0) return prev; const arr = [...prev]; if (!arr[idx-1] || !arr[idx]) return prev; const tmp = arr[idx-1]!; arr[idx-1] = arr[idx]!; arr[idx] = tmp; setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx - 1 : sel === idx - 1 ? idx : sel); return arr })}
            onMoveDown={(idx) => setCustomCfgs(prev => { if (idx === prev.length - 1) return prev; const arr = [...prev]; if (!arr[idx+1] || !arr[idx]) return prev; const tmp = arr[idx+1]!; arr[idx+1] = arr[idx]!; arr[idx] = tmp; setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx + 1 : sel === idx + 1 ? idx : sel); return arr })}
            onMoveTop={(idx) => setCustomCfgs(prev => { if (idx === 0) return prev; const arr = [...prev]; const m = arr[idx]; if (!m) return prev; arr.splice(idx, 1); arr.unshift(m); setSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? 0 : (sel < idx ? sel : sel))); return arr })}
            onMoveBottom={(idx) => setCustomCfgs(prev => { if (idx === prev.length - 1) return prev; const arr = [...prev]; const m = arr[idx]; if (!m) return prev; arr.splice(idx, 1); arr.push(m); setSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? arr.length - 1 : (sel > idx ? sel : sel))); return arr })}
            highlightDelete={hoverDeleteConfigs}
            onCopyAllConfigs={async () => {
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
              if (!ok) { setCopyText(text); setCopyDlgOpen(true) }
            }}
            onPasteAtEnd={async () => {
              const text = await readTextSafe()
              if (text && text.trim()) {
                try {
                  const { cfgs, note } = parseHsfrText(text, { metasets, minima, includeAllExplicitMeta })
                  if (cfgs.length > 0) {
                    const preLen = customCfgs.length
                    setCustomCfgs(prev => [...prev, ...cfgs])
                    if ((!hsfrNote || !hsfrNote.trim()) && typeof note === 'string' && note.trim()) { setHsfrNote(note) }
                    try { const sel = preLen + cfgs.length - 1; setSelectedCfgIdx(sel); setBuilder(cfgs[cfgs.length - 1]!) } catch {}
                    return
                  }
                } catch {}
                const cfgs = parseConfigsFromText(text, metasets)
                if (cfgs.length > 0) { const preLen = customCfgs.length; setCustomCfgs(prev => [...prev, ...cfgs]); try { const sel = preLen + cfgs.length - 1; setSelectedCfgIdx(sel); setBuilder(cfgs[cfgs.length - 1]!) } catch {} return }
              }
              // Fallback to manual paste dialog: paste at end and select last if empty
              setSelectedCfgIdx(null)
              setPasteSelectOnEmpty(true)
              setPasteAfterIdx(null)
              setPasteText('')
              setPasteErr(null)
              setPasteDlgOpen(true)
            }}
          />

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

        <Paper sx={{ p: 2, width: '100%', maxWidth: PANEL_WIDTH_PX, mx: 'auto', display: 'flex', flexDirection: 'column',
          [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: { mx: 0, width: PANEL_WIDTH_PX, height: leftHeight || 'auto', overflow: 'hidden' }
        }}>
      <PreviewHeaderActions
        mergedCount={mergedRules.length}
        colorIconSrc={colorIconSrc}
        onOpenColors={() => setColorsDlgOpen(true)}
        onSelectHsf={async (file) => {
          try {
            const parsed = await readHsfFile(file)
            setHsf(parsed)
          } catch (err) {
            console.error('Failed to parse .hsf file', err)
            setHsf(null)
          }
        }}
        onClearBase={() => setHsf(null)}
        {...(hsf ? { baseRuleCount: hsf.Rules.length } : {})}
        onExport={() => {
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
        exportDisabled={!mergedRules.length}
      />
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
              statButtonBorders={statButtonBorders}
              onToggleStatButtonBorders={(next) => setStatButtonBorders(next)}
              />
            </Box>
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
      <RestoreAutosaveDialog
        open={restoreDlgOpen}
        draft={restoreDraft}
        onDismiss={() => {
          setRestoreDlgOpen(false)
          // Capture a baseline snapshot at dismiss. Autosave remains disabled
          // until the user makes a change (divergence from this baseline).
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
            dismissBaselineRef.current = JSON.stringify(cur)
          } catch { dismissBaselineRef.current = null }
          // Keep previous autosave intact by not enabling here
          // Clear the loaded snapshot ref to avoid accidental comparisons
          loadedAutosaveRef.current = null
        }}
        onRestore={() => {
          const draft = restoreDraft
          if (draft) {
            if (Array.isArray(draft.Metasets)) setMetasets(draft.Metasets)
            if (draft.Minima && typeof draft.Minima === 'object') setMinima(draft.Minima)
            if (Array.isArray(draft.Configs)) setCustomCfgs(draft.Configs)
            setIncludeAllExplicitMeta(Boolean(draft.IncludeAllExplicitMeta))
            if (typeof draft.Note === 'string') setHsfrNote(draft.Note)
            const len = draft.Configs?.length ?? 0
            if (len > 0) {
              const savedSel = typeof draft.SelectedConfigIndex === 'number' ? draft.SelectedConfigIndex : (len - 1)
              const sel = savedSel >= 0 && savedSel < len ? savedSel : len - 1
              setSelectedCfgIdx(sel)
              try {
                const cfgs = (draft.Configs || [])
                if (cfgs[sel]) setBuilder(cfgs[sel]!)
              } catch {}
            } else {
              setSelectedCfgIdx(null)
            }
          }
          setRestoreDlgOpen(false)
          setAutosaveReady(true)
          loadedAutosaveRef.current = null
        }}
      />
      {/* Manage Colors Dialog */}
      <ManageColorsDialog
        open={colorsDlgOpen}
        onClose={() => setColorsDlgOpen(false)}
        substatColors={substatColors}
        setSubstatColors={setSubstatColors}
        onReset={() => setSubstatColors(defaultSubstatColorMapV5())}
      />
    </Container>
  )
}
