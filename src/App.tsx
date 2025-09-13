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
// import { artifactSetNames } from './lib/types'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { type BuilderConfig } from './lib/hsfBuilder'
import { parseConfigsFromText, buildReadableConfig, readHsfrFile, buildHsfrPayload, hsfrToBlob, parseHsfrText } from './lib/hsfrIO'
import { COPY_DIALOG_EVENT, writeTextSafe, readTextSafe } from './lib/clipboard'
// Autosave load handled by useAutosaveRestore
import { AUTOSAVE_KEY, STAT_BUTTON_BORDERS_KEY, PANEL_WIDTH_PX, SIDE_BY_SIDE_BREAKPOINT_PX, GRID_COLUMN_GAP_PX, FINAL_SELL_DEFAULT_LEVELS } from './lib/constants'
// (Removed local CRC32; autosave utils provide it.)

import { Box, Container, Paper, Stack, Typography, GlobalStyles, Tooltip, Button } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
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
import { useManageColorsDialog } from './hooks/useManageColorsDialog'
import { computeMergedRules } from './lib/merge'
import FileDragOverlay from './components/FileDragOverlay'
import { useFileDragDrop } from './hooks/useFileDragDrop'
import HeaderActions from './components/HeaderActions'
import ManageColorsDialog from './components/dialogs/ManageColorsDialog'
import FinalSellDialog from './components/dialogs/FinalSellDialog'
import HelpDialog from './components/HelpDialog'
import { TutorialCoach, type TutorialStep } from './components/tutorial/TutorialCoach'
import RestoreAutosaveDialog from './components/dialogs/RestoreAutosaveDialog'
import MetasetConflictDialog from './components/dialogs/MetasetConflictDialog'
import { useAutosave } from './hooks/useAutosave'
import PreviewHeaderActions from './components/PreviewHeaderActions'
import { useAutosaveRestore } from './hooks/useAutosaveRestore'
import { makeManageColorsIcon } from './lib/icons'
import { sellfileFilename, hsfrFilename } from './lib/filenames'
import { README_SEEN_VERSION_KEY, TUTORIAL_SEEN_VERSION_KEY } from './lib/constants'
import { ArtifactType, StatVariant, ArtifactSet } from './lib/types'
import type { Metaset } from './lib/metasets'
import { makeMetasetId, defaultMetasets } from './lib/metasets'
import { defaultMinima } from './lib/hsfBuilder'
import { generateMetasetNameWithFlag } from './lib/namegen'
import { useAppActions, useAppState } from './state/appState'

// Components are organized under src/components

export default function App() {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  // Shared app state via context — reduces prop drilling and keeps behavior consistent.
  const { customCfgs, selectedCfgIdx, metasets, minima, finalSellRemainder, hsfrNote } = useAppState()
  const { setCustomCfgs, setSelectedCfgIdx, setMetasets, setMinima, setFinalSellRemainder, setHsfrNote } = useAppActions()
  const [hoveredCfgIdx, setHoveredCfgIdx] = useState<number | null>(null)
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
  // Manage Colors dialog state + persisted substat colors
  const { open: colorsDlgOpen, openDialog: openColors, closeDialog: closeColors, substatColors, setSubstatColors, resetColors } = useManageColorsDialog()
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
  // colorsDlgOpen handled in useManageColorsDialog
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
    rarityMode: 'auto',
    factionCode: 0,
    mainStatsV: [],
    minLevel: 0,
    maxLevel: 16,
    earlyKeepMode: 'early',
    // Legacy fields retained for back‑compat; UI uses min/max levels now
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
  // Keep a ref to the latest builder so tutorial helpers can snapshot current
  // values at the moment of inserting, avoiding stale closures.
  const builderRef = React.useRef(builder)
  useEffect(() => { builderRef.current = builder }, [builder])
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
  // Help/README dialog state. Shows on first run for a new version.
  const [helpOpen, setHelpOpen] = useState<boolean>(false)
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(false)
  const [tutorialSteps, setTutorialSteps] = useState<TutorialStep[]>([])
  const [tutorialIdx, setTutorialIdx] = useState<number>(0)
  const [tutorialSnapshot, setTutorialSnapshot] = useState<null | {
    cfgs: BuilderConfig[]
    sel: number | null
    metas: Metaset[]
    mins: typeof minima
    fsr: typeof finalSellRemainder
    note: typeof hsfrNote
    builder: BuilderConfig
  }>(null)
  const [pendingFirstRunTutorial, setPendingFirstRunTutorial] = useState<boolean>(false)
  useEffect(() => {
    try {
      const seen = localStorage.getItem(README_SEEN_VERSION_KEY)
      if (seen !== APP_VERSION) {
        setHelpOpen(true)
        // Plan to show tutorial after Help is closed on first run
        setPendingFirstRunTutorial(true)
      }
    } catch {}
  }, [])

  // Start the interactive tutorial: runs a scripted tour with two examples.
  // Why: Provide a first-run, guided walkthrough of the crucial HSFR builder.
  const startTutorial = React.useCallback(() => {
    // Helpers to normalize UI state for each step so back/forward remain consistent
    const isMetasetsDialogOpen = () => Boolean(document.querySelector('[role="dialog"] [data-tour-id="metasets.close"]'))
    const ensureMetasetsDialog = (open: boolean) => {
      try {
        const openNow = isMetasetsDialogOpen()
        if (open && !openNow) {
          const btn = document.querySelector('[data-tour-id="builder.manage-metasets"]') as HTMLButtonElement | null
          btn?.click()
        } else if (!open && openNow) {
          const btn = document.querySelector('[data-tour-id="metasets.close"]') as HTMLButtonElement | null
          btn?.click()
        }
      } catch {}
    }
    // Timer for retry-opening Sets menu while highlighting metasets section
    let setsMenuRetryId: number | null = null
    const isSetsMenuOpen = () => {
      // Detect MUI Menu/Popover for Sets selector, not only metasets section
      return Boolean(
        document.querySelector('[data-tour-id="menu.metasets.section"]') ||
        document.querySelector('[role="menu"]') ||
        document.querySelector('.MuiMenu-paper, .MuiPopover-paper')
      )
    }
    const ensureSetsMenu = (open: boolean) => {
      try {
        const openNow = isSetsMenuOpen()
        if (open && !openNow) {
          const sel = document.querySelector('[data-tour-id="builder.sets"] .MuiSelect-select') as HTMLElement | null
          const el = sel || (document.querySelector('[data-tour-id="builder.sets"]') as HTMLElement | null)
          if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
        } else if (!open) {
          // Unconditionally attempt to close; Escape is safe if already closed
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          // Retry shortly in case a portal mounts late
          setTimeout(() => { try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {} }, 40)
          if (setsMenuRetryId !== null) { try { clearTimeout(setsMenuRetryId) } catch {}; setsMenuRetryId = null }
        }
      } catch {}
    }
    const isChipsMenuOpen = () => Boolean(document.querySelector('[data-tour-id="chips.menu"]'))
    const ensureChipsMenu = (open: boolean) => {
      try {
        const openNow = isChipsMenuOpen()
        if (open && !openNow) {
          const el = document.querySelector('[data-tour-id="chips.container"]') as HTMLElement | null
          if (el) {
            const r = el.getBoundingClientRect()
            el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
          }
        } else if (!open) {
          // Unconditional attempt to close the context menu; retry shortly as well
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          setTimeout(() => { try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {} }, 40)
        }
      } catch {}
    }
    // Capture snapshot for restore on exit/finish
    try {
      setTutorialSnapshot({
        cfgs: customCfgs,
        sel: selectedCfgIdx,
        metas: metasets,
        mins: minima,
        fsr: finalSellRemainder,
        note: hsfrNote,
        builder,
      })
    } catch {}
    // Reset app to a clean default state for the tutorial
    try {
      setHsf(null)
      setCustomCfgs([])
      setSelectedCfgIdx(null)
      setMetasets(defaultMetasets())
      setMinima(defaultMinima())
      setFinalSellRemainder({ artifacts: true, accessories: true, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> })
      setHsfrNote(null)
      setBuilder({
        name: '',
        keep: true,
        rankCode: 0,
        rarityCode: 0,
        rarityMode: 'auto',
        factionCode: 0,
        mainStatsV: [],
        minLevel: 0,
        maxLevel: 16,
        earlyKeepMode: 'early',
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
    } catch {}
    const addCurrentBuilder = () => {
      setCustomCfgs(prev => {
        const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
          ? selectedCfgIdx + 1
          : prev.length
        const snap = builderRef.current
        const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
        setSelectedCfgIdx(insertIdx)
        return next
      })
    }
    // Reset any previous tour
    setTutorialIdx(0)
    // Example 1: Basic – Keep Speed Boots with SPD main stat
    const basic: TutorialStep[] = [
      {
        id: 'welcome',
        title: 'Welcome',
        body: 'This quick tutorial guides you through building HSFR rules. We will create two example configs and point out the most important controls.',
        targetId: 'builder.panel',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'action',
        title: 'Choose Action',
        body: 'Each config decides whether matching items are kept or sold. Defaults to `Keep`. You can toggle it to `Sell` here.',
        targetId: 'builder.action',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'slots',
        title: 'Pick Slot(s)',
        body: 'Let’s target `Boots`. Click the `Boots` icon to select. We’ll select it for you now.',
        targetId: 'builder.slot.boots',
        before: () => setBuilder(prev => ({ ...prev, artifactTypes: [ArtifactType.Boots] })),
      },
      {
        id: 'mainstat',
        title: 'Select Main Stat',
        body: 'Now pick `SPD` as the main stat. This limits the config to Speed boots only.',
        targetId: 'builder.mainstat.spd',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); setBuilder(prev => ({ ...prev, mainStatsV: [StatVariant.SPD] })) },
      },
      {
        id: 'sets',
        title: 'Optional: Choose Sets',
        body: 'You can restrict to one or more `Sets`. We will choose Speed set here to demonstrate. You can keep it broader in your own configs.',
        targetId: 'builder.sets',
        before: () => { ensureMetasetsDialog(false); ensureChipsMenu(false); ensureSetsMenu(false); setBuilder(prev => ({ ...prev, artifactSets: [ArtifactSet.Speed] })) },
      },
      {
        id: 'add',
        title: 'Add Config',
        body: 'Add this builder as a new config to your list. You can reorder, duplicate, or delete configs later.',
        targetId: 'builder.add-config',
        before: () => { addCurrentBuilder() },
      },
      {
        id: 'save-hsfr',
        title: 'Save Your Configs',
        body: 'Use Save to export your current HSFR (configs + metasets). Load restores them later.',
        targetId: 'hsfr.save',
      },
      {
        id: 'preview-locate',
        title: 'Where to See Results',
        body: 'The preview table shows the merged sellfile rules (in the right panel or below the builder, depending on your screen).',
        targetId: 'preview.table',
      },
    ]

    // Example 2: Advanced – Core substats with roll minima
    const advanced: TutorialStep[] = [
      {
        id: 'adv-intro',
        title: 'Advanced Example',
        body: 'Next, we will build a config with core substats and roll thresholds. This is useful for targeting stronger pieces.',
        targetId: 'builder.panel',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'name',
        title: 'Name Your Config',
        body: 'Give this advanced config a short, readable `Name`. We filled one in to demonstrate.',
        targetId: 'builder.name',
        before: () => setBuilder(prev => ({ ...prev, name: 'DPS Core Rolls' })),
      },
      {
        id: 'subs',
        title: 'Choose Substats',
        body: 'Pick `SPD`, `CR%`, and `CDMG%`. `Substats` which are `locked` must be present; others are optional. We’ll select them for you now and require all three.',
        targetId: 'builder.substat.spd',
        before: () => setBuilder(prev => ({
          ...prev,
          substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
          fixedSubstatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
          autoMinCount: false,
          minCount: 3,
        })),
      },
      { id: 'subs-cr', title: 'Substat: CR% ', body: '`CR%` is another common DPS core substat.', targetId: 'builder.substat.cr' },
      { id: 'subs-cdmg', title: 'Substat: CDMG% ', body: '`CDMG%` pairs with `CR%` for damage builds.', targetId: 'builder.substat.cdmg' },
      {
        id: 'min-rolls',
        title: 'Minimum Required Rolls',
        body: 'Set a global `Minimum required rolls` across your picked substats. We’ll set it to 3. `Early`/`Late` controls how thresholds apply before +16.',
        targetId: 'builder.min-rolls',
        before: () => setBuilder(prev => ({ ...prev, autoMinRequiredRolls: false, minRequiredRolls: 3 })),
      },
      {
        id: 'thresholds',
        title: 'Milestone Thresholds',
        body: '`Milestone Thresholds`: `Early` gradually increases requirements as rolls are gained; `Late` requires only what must be present now so +16 remains achievable.',
        targetId: 'builder.thresholds',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-open',
        title: 'Manage Metasets',
        body: 'Open the `Manage metasets` dialog to create named groups of sets that you can reuse across configs.',
        targetId: 'builder.manage-metasets',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-add',
        title: 'Add a Metaset',
        body: 'Click `Add metaset` to create a new group.',
        targetId: 'metasets.add',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-close',
        title: 'Close Metasets',
        body: 'Click `Close` when done; your metasets appear at the top of the `Sets` selector.',
        targetId: 'metasets.close',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'sets-open',
        title: 'Select a Metaset',
        body: 'Open `Sets` and see your metasets at the top. They’re reusable across configs.',
        targetId: 'builder.sets',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'sets-metasets',
        title: 'Metasets in Sets',
        body: 'Your `Metasets` appear here at the top of the list for quick reuse.',
        targetId: 'menu.metasets.section',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(true); ensureChipsMenu(false)
          // Some environments render the menu on the next tick; retry opening once shortly after.
          if (setsMenuRetryId !== null) { try { clearTimeout(setsMenuRetryId) } catch {}; setsMenuRetryId = null }
          setsMenuRetryId = window.setTimeout(() => { try { ensureSetsMenu(true) } catch {} }, 60)
        },
      },
      {
        id: 'chips',
        title: 'Config Chips',
        body: 'Configs appear as `Config chips` you can click to edit. Right‑click the chips area for Copy/Paste actions and chip context menus.',
        targetId: 'chips.menu',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(true) },
      },
      {
        id: 'preview',
        title: 'Preview and Export',
        body: 'The `Preview` table shows the merged sellfile rules (right panel or below). Load a base `.hsf` to compare, then use `Export` to save your final sellfile.',
        targetId: 'preview.table',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'adv-add',
        title: 'Add Advanced Config',
        body: 'Add this advanced builder as another config. You can manage multiple configs and their order; first match wins.',
        targetId: 'builder.add-config',
        before: () => { addCurrentBuilder() },
      },
    ]

    const steps = [...basic, ...advanced]
    setTutorialSteps(steps)
    setTutorialOpen(true)
  }, [setBuilder])
  // Global file-drag overlay and file routing handled by hook
  const { active: fileDragActive } = useFileDragDrop({
    onHsfr: async (file: File) => {
      const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = await readHsfrFile(file, { metasets, minima })
      // File load replaces current state; no conflict resolution here
      setCustomCfgs(cfgs)
      if (nextMetas !== metasets) setMetasets(nextMetas)
      if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
      setFinalSellRemainder(fsr)
      const sel = selectedIndex
      setSelectedCfgIdx(sel)
      if (sel !== null && cfgs[sel]) setBuilder(cfgs[sel]!)
      if (note && String(note).trim()) { setHsfrNote(String(note)); setNoteMode('view'); setNoteOpen(true) } else { setHsfrNote(null); setNoteOpen(false) }
      try { setLastSavedSig(JSON.stringify({ customCfgs: cfgs, metasets: nextMetas, minima: nextMinima, finalSellRemainder: fsr })) } catch {}
    },
    onHsf: async (file: File) => {
      const parsed = await readHsfFile(file)
      setHsf(parsed)
    },
  })
  // Track whether configs (and related data) differ from the last explicit Save
  const currentConfigSig = useMemo(() => JSON.stringify({ customCfgs, metasets, minima, finalSellRemainder }), [customCfgs, metasets, minima, finalSellRemainder])
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
      const parsed = parseHsfrText(text, { metasets, minima })
      const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = parsed
      if (cfgs.length === 0) {
        setPasteErr('No valid config found in pasted text')
        return false
      }
      // Treat as full HSFR import path with potential metaset conflicts
      const prep = prepareHsfrImport(metasets, nextMetas, cfgs)
      if (prep.conflicts.length) {
        setPendingImport({ cfgs: prep.cfgsMapped, metasets: nextMetas, minima: nextMinima, finalSellRemainder: fsr, selectedIndex, ...(note ? { note } : {}), mode: 'after' })
        setConflictIds(prep.conflicts)
        setImportIdMap(prep.idMap)
        setMetasetConflictOpen(true)
        setPasteDlgOpen(false)
        setPasteErr(null)
        return true
      }
      const { nextMetas: metasDone } = finalizeImport(metasets, prep, 'keepCurrent')
      // Ensure referenced metaset IDs exist; create hidden placeholders with generated names
      {
        const refIds = new Set<string>()
        for (const c of prep.cfgsMapped) for (const id of (c.artifactMetaSets ?? [])) refIds.add(String(id))
        const have = new Set(metasDone.map(m => m.id))
        const namesBase = new Set(metasDone.map(m => m.name))
        const finalMetas = metasDone.slice()
        for (const id of refIds) {
          if (!have.has(id)) {
            let genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
            // Avoid duplicates if generator returns an existing one
            while (namesBase.has(genName)) genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
            namesBase.add(genName)
            finalMetas.push({ id, name: genName, sets: [], show: false })
            have.add(id)
          }
        }
        setMetasets(finalMetas)
      }
      // Insert after selected or at end
      setCustomCfgs(prev => {
        const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
          ? selectedCfgIdx + 1
          : prev.length
        return [...prev.slice(0, insertIdx), ...prep.cfgsMapped, ...prev.slice(insertIdx)]
      })
      setFinalSellRemainder(fsr)
      if ((!hsfrNote || !hsfrNote.trim()) && typeof note === 'string' && note.trim()) { setHsfrNote(note) }
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
        const parsed = parseHsfrText(text, { metasets, minima })
        const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = parsed
        if (cfgs.length > 0) {
          const prep = prepareHsfrImport(metasets, nextMetas, cfgs)
          if (prep.conflicts.length) {
            setPendingImport({ cfgs: prep.cfgsMapped, metasets: nextMetas, minima: nextMinima, finalSellRemainder: fsr, selectedIndex, ...(note ? { note } : {}), mode: 'after', afterIdx: idx })
            setConflictIds(prep.conflicts)
            setImportIdMap(prep.idMap)
            setMetasetConflictOpen(true)
            return
          }
          const { nextMetas: metasDone } = finalizeImport(metasets, prep, 'keepCurrent')
          // Ensure referenced metaset IDs exist; create hidden placeholders
          {
            const refIds = new Set<string>()
            for (const c of prep.cfgsMapped) for (const id of (c.artifactMetaSets ?? [])) refIds.add(String(id))
            const have = new Set(metasDone.map(m => m.id))
            const namesBase = new Set(metasDone.map(m => m.name))
            const finalMetas = metasDone.slice()
            for (const id of refIds) {
              if (!have.has(id)) {
                let genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
                while (namesBase.has(genName)) genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
                namesBase.add(genName)
                finalMetas.push({ id, name: genName, sets: [], show: false })
                have.add(id)
              }
            }
            setMetasets(finalMetas)
          }
          setCustomCfgs(prev => {
            const insertIdx = Math.min(prev.length, idx + 1)
            return [...prev.slice(0, insertIdx), ...prep.cfgsMapped, ...prev.slice(insertIdx)]
          })
          setFinalSellRemainder(fsr)
          if ((!hsfrNote || !hsfrNote.trim()) && typeof note === 'string' && note.trim()) { setHsfrNote(note) }
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
      finalSellRemainder,
    })
  }, [hsf, customCfgs, metasets, minima, finalSellRemainder])

  

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

  const { restoreDlgOpen: dlgOpen, restoreDraft, dismissRestore, acceptRestore, autosaveEnabled } = useAutosaveRestore({
    key: AUTOSAVE_KEY,
    version: APP_VERSION,
    metasets,
    minima,
    configs: customCfgs,
    finalSellRemainder,
    selectedConfigIndex: selectedCfgIdx,
    note: hsfrNote,
  })
  // no-op

  // ---- HSFR import conflict state ----
  type PendingImport = {
    cfgs: BuilderConfig[]
    metasets: Metaset[]
    minima: typeof minima
    finalSellRemainder: typeof finalSellRemainder
    selectedIndex: number | null
    note?: string
    mode: 'append' | 'after'
    afterIdx?: number
  }
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [metasetConflictOpen, setMetasetConflictOpen] = useState(false)
  const [conflictIds, setConflictIds] = useState<string[]>([])
  const [importIdMap, setImportIdMap] = useState<Map<string, string>>(new Map())
  // no separate stash for metas to add; computed on the fly

  function valueKey(sets: number[]): string {
    const arr = (sets || []).map(Number).slice().sort((a,b)=>a-b)
    return arr.join(',')
  }

  function prepareHsfrImport(current: Metaset[], incoming: Metaset[], cfgsIn: BuilderConfig[]) {
    const byIdCur = new Map(current.map(m => [m.id, m]))
    const byValCur = new Map<string, Metaset>()
    for (const m of current) byValCur.set(valueKey(m.sets), m)
    const idMap = new Map<string, string>()

    const conflicts: string[] = []
    const curVsIncById = new Map<string, { cur: Metaset; inc: Metaset }>()
    for (const inc of incoming) {
      const cur = byIdCur.get(inc.id)
      if (cur) {
        if (valueKey(cur.sets) !== valueKey(inc.sets)) { conflicts.push(inc.id); curVsIncById.set(inc.id, { cur, inc }) }
      }
    }

    const canonicalIncoming = new Map<string, string>() // valueKey -> canonical incoming ID (when not matching current)
    for (const inc of incoming) {
      const vkey = valueKey(inc.sets)
      if (curVsIncById.has(inc.id)) continue
      const curMatch = byValCur.get(vkey)
      if (curMatch) { idMap.set(inc.id, curMatch.id); continue }
      const existing = canonicalIncoming.get(vkey)
      if (existing) { idMap.set(inc.id, existing) } else { canonicalIncoming.set(vkey, inc.id) }
    }

    const toAdd: Metaset[] = []
    const seenAdd = new Set<string>()
    for (const inc of incoming) {
      if (curVsIncById.has(inc.id)) continue
      const target = idMap.get(inc.id) ?? inc.id
      if (byIdCur.has(target)) continue
      const vkey = valueKey(inc.sets)
      const canon = canonicalIncoming.get(vkey)
      if (canon && canon !== inc.id) continue
      if (seenAdd.has(target)) continue
      seenAdd.add(target)
      toAdd.push({ ...inc, id: target })
    }

    const cfgsMapped = cfgsIn.map(c => {
      const ids = (c.artifactMetaSets ?? []).slice()
      const mapped = ids.map(id => idMap.get(id) ?? id)
      return { ...c, artifactMetaSets: mapped }
    })

    return { idMap, toAdd, conflicts: Array.from(new Set(conflicts)), conflictPairs: curVsIncById, cfgsMapped }
  }

  function finalizeImport(baseCurrent: Metaset[], prep: ReturnType<typeof prepareHsfrImport>, strategy: 'keepCurrent' | 'useIncoming' | 'keepBoth') {
    const { toAdd, conflicts: ids, conflictPairs } = prep
    let nextMetas = baseCurrent.slice()
    const remapForConflicts = new Map<string, string>()
    if (ids.length) {
      if (strategy === 'useIncoming') {
        const map = new Map(nextMetas.map(m => [m.id, m]))
        for (const id of ids) {
          const pair = conflictPairs.get(id)!
          map.set(id, { ...pair.inc })
        }
        nextMetas = Array.from(map.values())
      } else if (strategy === 'keepBoth') {
        for (const id of ids) {
          const pair = conflictPairs.get(id)!
          let newId = makeMetasetId()
          while (nextMetas.some(m => m.id === newId) || id === newId) newId = makeMetasetId()
          nextMetas.push({ ...pair.inc, id: newId })
          remapForConflicts.set(id, newId)
        }
      } else {
        // keepCurrent: no change to current entries
      }
    }
    for (const m of toAdd) nextMetas.push(m)
    return { nextMetas, remapForConflicts }
  }

  // Build autosave payload and write via useAutosave (enabled after restore choice)
  const autosavePayload = useMemo(() => buildHsfrPayload({
    version: APP_VERSION,
    metasets,
    minima,
    configs: customCfgs,
    finalSellRemainder,
    selectedConfigIndex: selectedCfgIdx,
    ...(hsfrNote && hsfrNote.trim() ? { note: hsfrNote } : {}),
  }), [metasets, minima, customCfgs, finalSellRemainder, selectedCfgIdx, hsfrNote])
  useAutosave({ key: AUTOSAVE_KEY, payload: autosavePayload, enabled: autosaveEnabled && !tutorialOpen })
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



  // Manage Colors icon (bitmap), generated once at runtime
  const colorIconSrc = React.useMemo(() => makeManageColorsIcon(), [])
  // Final sell dialog state
  const [finalSellOpen, setFinalSellOpen] = useState<boolean>(false)

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
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 1, flex: 1, flexWrap: 'nowrap' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '9.5px', lineHeight: 1.15, textAlign: 'right' }}>
                v{APP_VERSION} — Build and preview sell files for RSL Helper. Made by [STBL] Nusi㊷
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0, fontSize: '9.5px', lineHeight: 1.15, textAlign: 'right' }}>
                Unofficial, fan-made tool — not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0, fontSize: '9.5px', lineHeight: 1.15, textAlign: 'right' }}>
                Many thanks to [STBL] Nasgor for his invaluable contributions! — Remember: Bleibt Stabil!
              </Typography>
            </Box>
            <Box sx={{ alignSelf: 'flex-start' }}>
              <Tooltip title="Open Help / README">
                <Button
                  size="medium"
                  variant="contained"
                  startIcon={<HelpOutlineIcon fontSize="small" />}
                  onClick={() => setHelpOpen(true)}
                  aria-label="Open Help / README"
                  sx={{ height: 34, minHeight: 34, px: 1.25 }}
                >
                  Help
                </Button>
              </Tooltip>
            </Box>
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
        <Paper ref={leftPaperRef} sx={{ p: 2, width: '100%', maxWidth: PANEL_WIDTH_PX, mx: 'auto', [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: { mx: 0, width: PANEL_WIDTH_PX } }} data-tour-id="builder.panel">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', columnGap: 1, mb: 1.25 }}>
            <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>Add Configs and Rules</Typography>
            <Typography variant="caption" color="text.secondary">Use the builder below to define configs and add them to your custom set. You can also load/save your custom configs (HSFR), including metasets, and manage them right here.</Typography>
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
                const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = await readHsfrFile(file, { metasets, minima })
                // File load replaces current state; no conflict resolution here
                setCustomCfgs(cfgs)
                if (nextMetas !== metasets) setMetasets(nextMetas)
                if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
                setFinalSellRemainder(fsr)
                const sel = selectedIndex
                setSelectedCfgIdx(sel)
                if (sel !== null && cfgs[sel]) setBuilder(cfgs[sel]!)
                if (note && String(note).trim()) { setHsfrNote(String(note)); setNoteMode('view'); setNoteOpen(true) } else { setHsfrNote(null); setNoteOpen(false) }
                try { setLastSavedSig(JSON.stringify({ customCfgs: cfgs, metasets: nextMetas, minima: nextMinima, finalSellRemainder: fsr })) } catch {}
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
                finalSellRemainder,
                selectedConfigIndex: selectedCfgIdx,
                ...(hsfrNote ? { note: hsfrNote } : {}),
              })
              const blob = hsfrToBlob(payload)
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = hsfrFilename()
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
          <MetasetConflictDialog
            open={metasetConflictOpen}
            count={conflictIds.length}
            onCancel={() => { setMetasetConflictOpen(false); setPendingImport(null); setConflictIds([]) }}
            onChoose={(choice) => {
              try {
                if (!pendingImport) { setMetasetConflictOpen(false); return }
                const prep = prepareHsfrImport(metasets, pendingImport.metasets, pendingImport.cfgs)
                const { nextMetas, remapForConflicts } = finalizeImport(metasets, prep, choice)
                const idMap = new Map(importIdMap)
                for (const [k,v] of remapForConflicts) idMap.set(k, v)
                const cfgs = pendingImport.cfgs.map(c => ({ ...c, artifactMetaSets: (c.artifactMetaSets ?? []).map(id => idMap.get(id) ?? id) }))
                // Ensure referenced IDs exist; create hidden placeholders if missing (merge into current metasets)
                const refIds = new Set<string>()
                for (const c of cfgs) for (const id of (c.artifactMetaSets ?? [])) refIds.add(String(id))
                const have = new Set(nextMetas.map(m => m.id))
                const finalMetas = nextMetas.slice()
                for (const id of refIds) {
                  if (!have.has(id)) {
                    const existingNames = metasets.map(m => m.name)
                    const gen = generateMetasetNameWithFlag(existingNames)
                    finalMetas.push({ id, name: gen.name, sets: [], show: false })
                  }
                }
                setMetasets(finalMetas)
                if (pendingImport.mode === 'append') {
                  const preLen = customCfgs.length
                  setCustomCfgs(prev => [...prev, ...cfgs])
                  setFinalSellRemainder(pendingImport.finalSellRemainder)
                  if ((!hsfrNote || !hsfrNote.trim()) && typeof pendingImport.note === 'string' && pendingImport.note.trim()) { setHsfrNote(pendingImport.note) }
                  try { const sel = preLen + cfgs.length - 1; setSelectedCfgIdx(sel); setBuilder(cfgs[cfgs.length - 1]!) } catch {}
                } else {
                  const after = Math.max(0, Math.min((pendingImport.afterIdx ?? customCfgs.length - 1), customCfgs.length - 1))
                  setCustomCfgs(prev => {
                    const insertIdx = Math.min(prev.length, after + 1)
                    return [...prev.slice(0, insertIdx), ...cfgs, ...prev.slice(insertIdx)]
                  })
                  setFinalSellRemainder(pendingImport.finalSellRemainder)
                  if ((!hsfrNote || !hsfrNote.trim()) && typeof pendingImport.note === 'string' && pendingImport.note.trim()) { setHsfrNote(pendingImport.note) }
                  try { setSelectedCfgIdx(after + cfgs.length); setBuilder(cfgs[cfgs.length - 1]!) } catch {}
                }
              } finally {
                setMetasetConflictOpen(false)
                setPendingImport(null)
                setConflictIds([])
              }
            }}
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
                finalSellRemainder,
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
                  const parsed = parseHsfrText(text, { metasets, minima })
                  const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = parsed
                  if (cfgs.length > 0) {
                    const prep = prepareHsfrImport(metasets, nextMetas, cfgs)
                    if (prep.conflicts.length) {
                      setPendingImport({ cfgs: prep.cfgsMapped, metasets: nextMetas, minima: nextMinima, finalSellRemainder: fsr, selectedIndex, ...(note ? { note } : {}), mode: 'append' })
                      setConflictIds(prep.conflicts)
                      setImportIdMap(prep.idMap)
                      setMetasetConflictOpen(true)
                      return
                    }
                    const { nextMetas: metasDone } = finalizeImport(metasets, prep, 'keepCurrent')
                    // Ensure referenced metaset IDs exist; create hidden placeholders
                    {
                      const refIds = new Set<string>()
                      for (const c of prep.cfgsMapped) for (const id of (c.artifactMetaSets ?? [])) refIds.add(String(id))
                      const have = new Set(metasDone.map(m => m.id))
                      const namesBase = new Set(metasDone.map(m => m.name))
                      const finalMetas = metasDone.slice()
                      for (const id of refIds) {
                        if (!have.has(id)) {
                          let genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
                          while (namesBase.has(genName)) genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
                          namesBase.add(genName)
                          finalMetas.push({ id, name: genName, sets: [], show: false })
                          have.add(id)
                        }
                      }
                      setMetasets(finalMetas)
                    }
                    const preLen = customCfgs.length
                    setCustomCfgs(prev => [...prev, ...prep.cfgsMapped])
                    setFinalSellRemainder(fsr)
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
        onOpenColors={openColors}
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
          a.href = url
          a.download = sellfileFilename()
          a.click()
          URL.revokeObjectURL(url)
          try { setToastMsg('Sellfile saved. Check your Downloads folder.'); setToastOpen(true) } catch {}
        }}
        exportDisabled={!mergedRules.length}
        finalSell={finalSellRemainder}
        onToggleFinalSell={(enabled) => {
          setFinalSellRemainder(prev => {
            const cur = prev ?? { artifacts: true, accessories: true, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> }
            if (enabled) {
              const hasTypes = cur.artifacts || cur.accessories
              const hasLevels = (cur.levels?.length ?? 0) > 0
              return { artifacts: hasTypes ? cur.artifacts : true, accessories: hasTypes ? cur.accessories : true, levels: hasLevels ? cur.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16>) }
            } else {
              return { ...cur, artifacts: false, accessories: false }
            }
          })
        }}
        onOpenFinalSellDialog={() => setFinalSellOpen(true)}
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

      {/* Help / README dialog. Marks the version as seen when closed. */}
      <HelpDialog
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false)
          try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
          // If this is a fresh version and tutorial wasn't seen, auto-start it
          try {
            const tutSeen = localStorage.getItem(TUTORIAL_SEEN_VERSION_KEY)
            if (pendingFirstRunTutorial && tutSeen !== APP_VERSION) {
              startTutorial()
            }
          } catch {}
        }}
        onStartTutorial={() => {
          try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
          setHelpOpen(false)
          startTutorial()
        }}
      />
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
        open={dlgOpen}
        draft={restoreDraft}
        onDismiss={() => {
          dismissRestore()
        }}
        onRestore={() => {
          const draft = restoreDraft
          if (draft) {
            if (Array.isArray(draft.Metasets)) setMetasets(draft.Metasets)
            if (draft.Minima && typeof draft.Minima === 'object') setMinima(draft.Minima)
            if (Array.isArray(draft.Configs)) setCustomCfgs(draft.Configs)
            if (draft.FinalSellRemainder && typeof draft.FinalSellRemainder === 'object') {
              try {
                const fsr = draft.FinalSellRemainder as { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> }
                setFinalSellRemainder(fsr)
              } catch {}
            }
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
          acceptRestore()
        }}
      />
      {/* Manage Colors Dialog */}
      <ManageColorsDialog
        open={colorsDlgOpen}
        onClose={closeColors}
        substatColors={substatColors}
        setSubstatColors={setSubstatColors}
        onReset={resetColors}
      />
      {/* Final Sell configuration */}
      <FinalSellDialog
        open={finalSellOpen}
        value={finalSellRemainder}
        onChange={(v) => setFinalSellRemainder(v)}
        onClose={() => setFinalSellOpen(false)}
        onReset={() => setFinalSellRemainder({ artifacts: true, accessories: true, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> })}
      />
      {/* Tutorial overlay */}
      <TutorialCoach
        open={tutorialOpen}
        steps={tutorialSteps}
        stepIndex={tutorialIdx}
        onClose={() => {
          setTutorialOpen(false)
          // Restore snapshot if present
          try {
            const snap = tutorialSnapshot
            if (snap) {
              setCustomCfgs(snap.cfgs)
              setSelectedCfgIdx(snap.sel)
              setMetasets(snap.metas)
              setMinima(snap.mins)
              setFinalSellRemainder(snap.fsr)
              setHsfrNote(snap.note)
              setBuilder(snap.builder)
            }
          } catch {}
          setTutorialSnapshot(null)
        }}
        onPrev={() => setTutorialIdx((i) => Math.max(0, i - 1))}
        onNext={() => {
          setTutorialIdx((i) => {
            const next = i + 1
            if (next >= tutorialSteps.length) {
              try { localStorage.setItem(TUTORIAL_SEEN_VERSION_KEY, APP_VERSION) } catch {}
              setTutorialOpen(false)
              // Restore snapshot on finish
              try {
                const snap = tutorialSnapshot
                if (snap) {
                  setCustomCfgs(snap.cfgs)
                  setSelectedCfgIdx(snap.sel)
                  setMetasets(snap.metas)
                  setMinima(snap.mins)
                  setFinalSellRemainder(snap.fsr)
                  setHsfrNote(snap.note)
                  setBuilder(snap.builder)
                }
              } catch {}
              setTutorialSnapshot(null)
              return i
            }
            return next
          })
        }}
      />
    </Container>
  )
}

// (no-op) placeholder removed; startTutorial is defined within App component.
