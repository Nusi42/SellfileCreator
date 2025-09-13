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
import { flushSync } from 'react-dom'
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
  // Refs to avoid stale closures in tutorial snapshot/restore
  const hsfRef = React.useRef(hsf)
  useEffect(() => { hsfRef.current = hsf }, [hsf])
  const cfgsRef = React.useRef(customCfgs)
  useEffect(() => { cfgsRef.current = customCfgs }, [customCfgs])
  const selRef = React.useRef(selectedCfgIdx)
  useEffect(() => { selRef.current = selectedCfgIdx }, [selectedCfgIdx])
  const metasRef = React.useRef(metasets)
  useEffect(() => { metasRef.current = metasets }, [metasets])
  const minimaRef = React.useRef(minima)
  useEffect(() => { minimaRef.current = minima }, [minima])
  const fsrRef = React.useRef(finalSellRemainder)
  useEffect(() => { fsrRef.current = finalSellRemainder }, [finalSellRemainder])
  const noteRef = React.useRef(hsfrNote)
  useEffect(() => { noteRef.current = hsfrNote }, [hsfrNote])
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
  // When Help is opened automatically on first run for a version, replace Close with Start Tutorial
  const [helpFirstRunMode, setHelpFirstRunMode] = useState<boolean>(false)
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(false)
  const [tutorialSteps, setTutorialSteps] = useState<TutorialStep[]>([])
  const [tutorialIdx, setTutorialIdx] = useState<number>(0)
  const [tutorialSections, setTutorialSections] = useState<Array<{ label: string; index: number }>>([])
  // Track one-time tutorial actions to avoid repeating when navigating back/forward
  const [tutorialAddedBasic, setTutorialAddedBasic] = useState<boolean>(false)
  const [tutorialAddedAdvanced, setTutorialAddedAdvanced] = useState<boolean>(false)
  const [tutorialAddedSlowDD, setTutorialAddedSlowDD] = useState<boolean>(false)
  const [tutorialAddedDefaultMetas, setTutorialAddedDefaultMetas] = useState<boolean>(false)
  // Central store for any tutorial-related timers to avoid races when stepping/jumping
  const tutorialTimersRef = React.useRef<{ setsMenuRetryId: number | null }>({ setsMenuRetryId: null })
  const [tutorialSnapshot, setTutorialSnapshot] = useState<null | {
    hsf: HsfFile | null
    cfgs: BuilderConfig[]
    sel: number | null
    metas: Metaset[]
    mins: typeof minima
    fsr: typeof finalSellRemainder
    note: typeof hsfrNote
    builder: BuilderConfig
  }>(null)

  // Best-effort closer for transient UI (menus, popovers, dialogs).
  // Why: On tutorial exit/finish, ensure no tutorial-opened UI remains visible
  // (e.g., Manage Metasets dialog, Sets menu, context menus) so users return
  // to a clean, pre-tutorial app state with autosave re-enabled safely.
  const closeAllTransientUi = React.useCallback(() => {
    try {
      // Close any menus/popovers and context menus with Escape (twice to catch portals)
      const pressEsc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      pressEsc(); setTimeout(pressEsc, 40)
    } catch {}
    try {
      // Ensure Final Sell dialog is closed; this state is UI-only and not part of HSFR.
      setFinalSellOpen(false)
    } catch {}
    try {
      // Targeted ESC on common menu/list surfaces (helps when overlay blocks clicks)
      const listbox = document.querySelector('ul[role="listbox"]') as HTMLElement | null
      const menuEl = document.querySelector('[data-tour-id="chips.menu"]') as HTMLElement | null
      const chipMenuEl = document.querySelector('[data-tour-id="chip.menu"]') as HTMLElement | null
      listbox?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      menuEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      const menuUl = menuEl?.querySelector('ul[role="menu"]') as HTMLElement | null
      menuUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      chipMenuEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      const chipUl = chipMenuEl?.querySelector('ul[role="menu"]') as HTMLElement | null
      chipUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    } catch {}
    try {
      // Clear tutorial timers so no reopen happens after we close
      const t = tutorialTimersRef.current
      if (t.setsMenuRetryId !== null) { clearTimeout(t.setsMenuRetryId); t.setsMenuRetryId = null }
    } catch {}
    try {
      // Explicitly close Manage Metasets dialog if its Close button is present
      const btn = document.querySelector('[data-tour-id="metasets.close"]') as HTMLButtonElement | null
      btn?.click()
    } catch {}
    try {
      // Fallback click on the page to commit close for any lingering popovers
      setTimeout(() => {
        try {
          const target = document.body as HTMLElement
          const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit
          target.dispatchEvent(new MouseEvent('mousedown', opts))
          target.dispatchEvent(new MouseEvent('mouseup', opts))
          target.dispatchEvent(new MouseEvent('click', opts))
        } catch {}
      }, 60)
    } catch {}
  }, [])

  // Restores the pre-tutorial snapshot in a single synchronous batch.
  // Why: Prevents interleaving with any lingering tutorial timers/effects so the
  // user reliably returns to the exact pre-tutorial builder/config state.
  const restoreFromTutorialSnapshot = React.useCallback(() => {
    const snap = tutorialSnapshot
    if (!snap) return
    try {
      flushSync(() => {
        setHsf(snap.hsf)
        setCustomCfgs(snap.cfgs)
        setSelectedCfgIdx(snap.sel)
        setMetasets(snap.metas)
        setMinima(snap.mins)
        setFinalSellRemainder(snap.fsr)
        setHsfrNote(snap.note)
        setBuilder(snap.builder)
      })
    } catch {}
  }, [tutorialSnapshot, setCustomCfgs, setSelectedCfgIdx, setMetasets, setMinima, setFinalSellRemainder, setHsfrNote, setBuilder])
  useEffect(() => {
    try {
      const seen = localStorage.getItem(README_SEEN_VERSION_KEY)
      if (seen !== APP_VERSION) {
        setHelpFirstRunMode(true)
        setHelpOpen(true)
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
          // Also send ESC to the listbox itself, if present
          try { (document.querySelector('ul[role="listbox"]') as HTMLElement | null)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
          // Retry shortly in case a portal mounts late
          setTimeout(() => { try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {} }, 40)
          // Cancel any pending retry-opens to avoid reopening after we just closed it
          const t = tutorialTimersRef.current
          if (t.setsMenuRetryId !== null) { try { clearTimeout(t.setsMenuRetryId) } catch {}; t.setsMenuRetryId = null }
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
          // Unconditional attempt to close the context menu; use both Escape and an outside click
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          // Also send ESC to the menu element and inner ul[role=menu]
          try {
            const menuEls = [
              document.querySelector('[data-tour-id="chips.menu"]') as HTMLElement | null,
              document.querySelector('[data-tour-id="chip.menu"]') as HTMLElement | null,
            ]
            for (const m of menuEls) {
              m?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
              const menuUl = m?.querySelector('ul[role="menu"]') as HTMLElement | null
              menuUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            }
          } catch {}
          setTimeout(() => {
            try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
            try {
              const target = document.body as HTMLElement
              const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit
              target.dispatchEvent(new MouseEvent('mousedown', opts))
              target.dispatchEvent(new MouseEvent('mouseup', opts))
              target.dispatchEvent(new MouseEvent('click', opts))
            } catch {}
          }, 40)
        }
      } catch {}
    }
    const isFinalSellDialogOpen = () => Boolean(document.querySelector('[data-tour-id="finalsell.dialog"]'))
    const ensureFinalSellDialog = (open: boolean) => {
      try {
        const openNow = isFinalSellDialogOpen()
        if (open && !openNow) { setFinalSellOpen(true) }
        else if (!open && openNow) { setFinalSellOpen(false) }
      } catch {}
    }
    // Capture snapshot for restore on exit/finish
    try {
      // Deep-clone snapshot to avoid aliasing if tutorial mutates nested arrays later.
      const cloneHsf = hsfRef.current ? (JSON.parse(JSON.stringify(hsfRef.current)) as HsfFile) : null
      const srcCfgs = cfgsRef.current
      const srcMetas = metasRef.current
      const srcMinima = minimaRef.current
      const srcFsr = fsrRef.current
      const srcBuilder = builderRef.current
      const cloneCfgs = srcCfgs.map(c => ({ ...c }))
      const cloneMetas = srcMetas.map(m => ({ ...m, sets: m.sets.slice() }))
      const cloneMinima = JSON.parse(JSON.stringify(srcMinima)) as typeof minima
      const cloneFsr = srcFsr ? JSON.parse(JSON.stringify(srcFsr)) as typeof finalSellRemainder : srcFsr
      const cloneBuilder = JSON.parse(JSON.stringify(srcBuilder)) as BuilderConfig
      setTutorialSnapshot({
        hsf: cloneHsf,
        cfgs: cloneCfgs,
        sel: selRef.current,
        metas: cloneMetas,
        mins: cloneMinima,
        fsr: cloneFsr,
        note: noteRef.current,
        builder: cloneBuilder,
      })
    } catch {}
    // Reset app to a clean default state for the tutorial
    try {
      setHsf(null)
      setCustomCfgs([])
      setSelectedCfgIdx(null)
      // Start with no metasets during the tutorial to teach creation clearly
      setMetasets([])
      setMinima(defaultMinima())
      // During tutorial, keep Final Sell off to avoid confusion; keep default levels ready
      setFinalSellRemainder({ artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> })
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
    // addCurrentBuilder was inlined into onNext to avoid implicit adds on step transitions
    // Reset any previous tour
    setTutorialIdx(0)
    setTutorialAddedBasic(false)
    setTutorialAddedAdvanced(false)
    setTutorialAddedSlowDD(false)
    setTutorialAddedDefaultMetas(false)
    // Example 1: Basic — match README wording and ELI5 style
    const basic: TutorialStep[] = [
      {
        id: 'welcome',
        title: 'Welcome',
        body: 'With ~~RSL Helper Sellfile Creator~~ you can build rules in `Add Configs and Rules` and see results in `Sellfile Preview`. You\'ll pick stats, `Sets`, and levels like `+16` to decide what to keep or sell.\n\nTip: 💡 You can start this tutorial any time from the help button.',
        targetId: 'builder.panel',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false) },
      },
      {
        id: 'action',
        title: 'Choose Action',
        body: 'Pick `Keep` or `Sell`. This decides what happens to items that match this config.',
        targetId: 'builder.action',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false) },
      },
      {
        id: 'enabled',
        title: 'Enabled in Sellfile',
        body: 'Toggle `Enabled in Sellfile` to include or exclude this config in the exported file. Disabled configs remain saved and show in `Sellfile Preview` with a strikethrough. RSL Helper ignores these rules in the exported file.',
        targetId: 'builder.enabled',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'basics',
        title: 'Rank/Rarity/Levels',
        body: 'Set `Rank`, `Rarity`, `Faction`, `Min Level`, and `Max Level`. If `Rarity` is `Auto`, it picks the lowest rarity that can still reach your requested `Min required rolls` by `+16`.',
        targetId: 'builder.panel',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'slots',
        title: 'Pick Slot(s)',
        body: 'Let\'s target `Boots`. Click the `Boots` icon to select. We\'ll select it for you now.',
        targetId: 'builder.slot.boots',
        before: () => setBuilder(prev => ({ ...prev, artifactTypes: [ArtifactType.Boots] })),
      },
      {
        id: 'mainstat',
        title: 'Select Main Stat',
        body: 'Pick `SPD` in `Mainstat`. This makes the rule about Speed boots only.',
        targetId: 'builder.mainstat.spd',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); setBuilder(prev => ({ ...prev, mainStatsV: [StatVariant.SPD] })) },
      },
      {
        id: 'sets',
        title: 'Optional: Choose Sets',
        body: 'Pick gear `Sets` (like Speed) or leave it open to stay broad. We\'ll choose Speed here as an example.',
        targetId: 'builder.sets',
        before: () => { ensureMetasetsDialog(false); ensureChipsMenu(false); ensureSetsMenu(false); setBuilder(prev => ({ ...prev, artifactSets: [ArtifactSet.Speed] })) },
      },
      {
        id: 'add',
        title: 'Add Config',
        body: 'Click `Add as new config`. Press `Next` and we will click it for you. After adding, the button text changes to `Insert after selected`.',
        targetId: 'builder.add-config',
      },
      {
        id: 'added',
        title: 'Config Added',
        body: 'Nais! The new `Config chip` is selected. The button now shows `Insert after selected`, meaning new configs will go after the selected one.',
        targetId: 'chips.container',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'preview-locate',
        title: 'See Your Rules',
        body: 'The `Sellfile Preview` shows the rules your config creates. You see one rule because no `Substats` were chosen — it basically says: keep all `Boots` with `SPD` in the `Speed` set. Click a row to select the matching config; click a chip to jump to its first row.',
        targetId: 'preview.paper',
      },
    ]

    // Example 2: Advanced — substats and roll thresholds (ELI5 wording)
    const advanced: TutorialStep[] = [
      {
        id: 'adv-intro',
        title: 'Advanced Example',
        body: 'Now let\'s target stronger pieces with `Substats` and rolls. We\'ll set simple, readable goals you can reuse.',
        targetId: 'builder.panel',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'adv-goal',
        title: 'Goal for this Example',
        body: 'We\'ll focus on damage `Chestplate` and `Boots` with main stats `HP%`, `ATK%`, and `DEF%`. This shows how to steer slot and main stat together.',
        targetId: 'builder.panel',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'adv-select-slots-main',
        title: 'Select Slots and Mainstats',
        body: 'Select `Chestplate` and `Boots` in `Slots`, and choose `HP%`, `ATK%`, `DEF%` in `Mainstat`. We\'ve applied these for you.',
        targetIds: ['builder.slots', 'builder.mainstat'],
        before: () => setBuilder(prev => ({
          ...prev,
          artifactTypes: [ArtifactType.Chestplate, ArtifactType.Boots],
          mainStatsV: [StatVariant.HP, StatVariant.ATK, StatVariant.DEF],
        })),
      },
      {
        id: 'name',
        title: 'Name Your Config',
        body: 'Give this config a short, clear `Name`. We\'ll fill one in for you now.',
        targetId: 'builder.name',
        before: () => setBuilder(prev => ({ ...prev, name: 'DPS Core Rolls' })),
      },
      {
        id: 'subs',
        title: 'Choose Substats',
        body: 'Pick `SPD`, `CR%`, and `CDMG%` in `Substats`. Click again to lock (🔒) a substat so it must be present. We\'ll lock only `CDMG%`.',
        targetId: 'builder.substats',
        before: () => setBuilder(prev => ({
          ...prev,
          substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
          fixedSubstatsV: [StatVariant.CDMG],
        })),
      },
      {
        id: 'required',
        title: 'Required Substats',
        body: 'Set `Required substats` to how many of your picks the item must have. We\'ll set it to `2` so the item needs `CDMG%` plus one of `SPD` or `CR%`. `Auto` matches how many you selected (up to 4). Locked substats always count.',
        targetId: 'builder.required',
        before: () => setBuilder(prev => ({ ...prev, autoMinCount: false, minCount: 2 })),
      },
      {
        id: 'min-rolls',
        title: 'Minimum Required Rolls',
        body: '`Min required rolls` is a total across your picked substats (a sum of upgrade rolls). Example: 3 means at least three rolls combined on your chosen stats by `+16` (not 3 each). We\'ll set it to 3.',
        targetId: 'builder.min-rolls',
        before: () => setBuilder(prev => ({ ...prev, autoMinRequiredRolls: false, minRequiredRolls: 3 })),
      },
      {
        id: 'thresholds',
        title: 'Milestone Thresholds',
        body: 'Use `Milestone Thresholds` to shape early rows: `Early` rises as rolls are gained; `Late` stays lenient until all requested rolls are met at level `+16`.',
        targetId: 'builder.thresholds',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-open',
        title: 'Manage Metasets',
        body: 'Open `Manage metasets` to create named groups of `Sets` you can reuse across configs.',
        targetId: 'builder.manage-metasets',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-add',
        title: 'Add a Metaset',
        body: 'Click `Add metaset` to make a new group. Press `Next` and we will create one named `Slow DD` with `Lethal`, `Savage`, and `Stoneskin` sets. You can change metasets any time — updates apply to your current configs right away. You can also change the default metasets.',
        targetId: 'metasets.add',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-added',
        title: 'Metaset Added',
        body: 'Here\'s your `Slow DD` metaset with `Lethal`, `Savage`, and `Stoneskin`. You can rename it or change sets any time.',
        targetId: 'metasets.dialog',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-defaults',
        title: 'Included Metasets',
        body: 'By default, the app includes helpful metasets: `Nuker`, `Support - Debuffer`, and `Support - Survivability`. There are also other default metasets available (not shown in this tutorial).',
        targetId: 'metasets.dialog',
        before: () => {
          ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false)
          if (!tutorialAddedDefaultMetas) {
            const wanted = new Set(['Nuker', 'Support - Debuffer', 'Support - Survivability'])
            const defs = defaultMetasets().filter(m => wanted.has(m.name))
            setMetasets(prev => {
              const have = new Set(prev.map(m => m.name))
              const add = defs.filter(d => !have.has(d.name))
              return add.length ? prev.concat(add) : prev
            })
            setTutorialAddedDefaultMetas(true)
          }
        },
      },
      {
        id: 'metasets-close',
        title: 'Close Metasets',
        body: 'Click `Close` when done. Your `Metasets` appear at the top of `Sets` for quick picks.',
        targetId: 'metasets.close',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'sets-open',
        title: 'Select a Metaset',
        body: 'Open `Sets` and pick from your `Metasets` at the top. They\'re reusable across configs.',
        targetId: 'builder.sets',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'sets-metasets',
        title: 'Metasets in Sets',
        body: 'Your `Metasets` show here at the top of the list for quick reuse.',
        targetId: 'menu.metasets.section',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(true); ensureChipsMenu(false)
          // Some environments render the menu on the next tick; retry opening once shortly after.
          const t = tutorialTimersRef.current
          if (t.setsMenuRetryId !== null) { try { clearTimeout(t.setsMenuRetryId) } catch {}; t.setsMenuRetryId = null }
          t.setsMenuRetryId = window.setTimeout(() => { try { ensureSetsMenu(true) } catch {} }, 60)
        },
      },
      {
        id: 'adv-add',
        title: 'Add Advanced Config',
        body: 'Click `Add as new config` to save this advanced example. Press `Next` and we will click it for you. You can manage multiple configs and their order; first match wins.',
        targetId: 'builder.add-config',
      },
      {
        id: 'adv-added',
        title: 'Advanced Config Added',
        body: 'Great! The advanced `Config chip` is now added and selected. Use the chip menu to duplicate, move, or delete configs.',
        targetId: 'chips.container',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'adv-preview-early',
        title: 'What These Rules Do',
        body: 'The `Sellfile Preview` shows what this config creates — about 84 rules that accept any mix of `SPD`/`CR%`/`CDMG%` with at least `2` rolls. Because we chose `Early`, those `2` rolls show up by level `+8`. Gear that doesn\'t match these rules gets checked by the next ones; if nothing matches, a `Final Sell` rule could sell it (we\'ll explain `Final Sell` soon).',
        targetId: 'preview.table',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'chips',
        title: 'Config Chips',
        body: 'Configs appear as `Config chips`. Right‑click a selected chip to open its menu — use `Copy to Clipboard` to share just that config (handy for Discord/Telegram). Right‑click empty space here to use `Copy all Configs` or `Paste at End` for your whole list.',
        targetId: 'chips.container',
        before: () => {
          // Keep context menu closed; only highlight the chips area and scroll it into view
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false)
          try {
            const el = document.querySelector('[data-tour-id="chips.container"]') as HTMLElement | null
            el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
          } catch {}
          // Open the context menu on the selected chip for demonstration
          try {
            const chip = document.querySelector('[data-tour-id="chip.selected"]') as HTMLElement | null
            if (chip) {
              const r = chip.getBoundingClientRect()
              chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
            }
          } catch {}
        },
      },
      {
        id: 'finalsell-intro',
        title: 'Final Sell (optional)',
        body: 'Use `Final Sell` to add simple `Sell` rules for any items that do not match your configs. Click the `Final Sell` button to toggle. When on, you\'ll see `Final Sell is On!`. Keep it off if you only want your explicit configs to apply.',
        targetId: 'finalsell.toggle',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false) },
      },
      {
        id: 'finalsell-config',
        title: 'Configure Final Sell',
        body: 'Click the sliders icon to `Configure`. We\'ll open the dialog next.',
        targetId: 'finalsell.config',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false) },
      },
      {
        id: 'finalsell-dialog',
        title: 'Final Sell Dialog',
        body: 'Choose what to sell (`Artifacts`, `Accessories`) and which `Level Ranges` (like `0–3`, `4–7`, … `16`). These add Sell rules for unmatched items. We\'re turning on `Artifacts` only — we haven\'t targeted `Accessories` in this tutorial. `+16` is off by default to avoid selling fully leveled gear. You can turn it on here, or flip it later in ~~RSL Helper~~ after you\'ve checked it will sell exactly what you want.',
        targetIds: ['finalsell.dialog', 'finalsell.dialog.types', 'finalsell.dialog.levels'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false)
          try {
            setFinalSellOpen(true)
            setFinalSellRemainder(prev => ({
              artifacts: true,
              accessories: false,
              levels: (prev?.levels?.length ? prev.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16>)),
            }))
          } catch {}
        },
      },
      {
        id: 'note',
        title: 'Add a Note',
        body: 'Use `Add Note` to jot a simple reminder for future you — what this project is about, version links, or anything helpful. If you share your `.hsfr`, this note also helps anyone who opens it understand what it\'s about and what to do next. Notes save with your configs in `.hsfr` and don\'t go into the exported `.hsf` sellfile.',
        targetId: 'note.toggle',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false) },
      },
      {
        id: 'save-explain',
        title: 'Save Configs (.hsfr)',
        body: 'Use `Save Configs (.hsfr)` to save your project (`Configs`, `Metasets`, `Note`). Saves to your browser\'s Downloads folder. Filenames include a timestamp. It\'s safe to save often so you can go back if needed.',
        targetId: 'hsfr.save',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); try { setFinalSellOpen(false) } catch {} },
      },
      {
        id: 'export-explain',
        title: 'Export RSL Helper Sellfile',
        body: 'Click `Export RSL Helper Sellfile` to save your `.hsf`. The file downloads to your browser\'s Downloads folder. It\'s safe to export multiple times; each has a timestamp so you can revert if you make a mistake.',
        targetId: 'hsf.export',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); try { setFinalSellOpen(false) } catch {} },
      },
      {
        id: 'preview',
        title: 'Preview and Finish',
        body: 'The `Sellfile Preview` shows your final rules. You can `Load RSL Helper Sellfile` to combine (merge) it with your rules — this is usually not needed. If you do load one, its rules are prepended (come first) before the rules from your configs (`Config chips`). First match wins — so any `Sell` rules in the loaded file can match before your own.\n\nTip: 💡 You can start this tutorial any time from the help button.',
        targetId: 'preview.paper',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); try { setFinalSellOpen(false) } catch {} },
      },
    ]

    const steps = [...basic, ...advanced]
    setTutorialSteps(steps)
    // Build tutorial sections for breadcrumb navigation
    const find = (id: string) => steps.findIndex(s => s.id === id)
    const sections: Array<{ label: string; index: number }> = [
      { label: 'Basics', index: find('welcome') },
      { label: 'Advanced', index: find('adv-intro') },
      { label: 'Metasets', index: find('metasets-open') },
      { label: 'Config Chips', index: find('adv-add') },
      { label: 'Final Sell', index: find('finalsell-intro') },
      { label: 'Save & Export', index: find('note') },
    ].filter(s => s.index >= 0)
    setTutorialSections(sections)
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
                  onClick={() => { setHelpFirstRunMode(false); setHelpOpen(true) }}
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
        }} data-tour-id="preview.paper">
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
        firstRunMode={helpFirstRunMode}
        onClose={() => {
          setHelpOpen(false)
          // Close without auto-start; manual Help never auto-starts
          setHelpFirstRunMode(false)
          try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
        }}
        onStartTutorial={() => {
          try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
          setHelpOpen(false)
          setHelpFirstRunMode(false)
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
        sections={tutorialSections}
        onSkipTo={(idx) => {
          try {
            // Proactively close transient UI and cancel tutorial timers when jumping
            closeAllTransientUi()
            // Fast-forward/backward: reconstruct tutorial state as if we walked
            // through steps from the beginning to the target index.
            const steps = tutorialSteps
            // Baseline tutorial state (matches startTutorial)
            let nextHsf: HsfFile | null = null
            let nextCfgs: BuilderConfig[] = []
            let nextSel: number | null = null
            let nextMetas = [] as Metaset[]
            let nextMinima = defaultMinima()
            let nextFsr = { artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> }
            let nextNote: string | null = null
            let nextBuilder: BuilderConfig = {
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
            }
            const ensureSlowDD = () => {
              if (!nextMetas.some(m => m.name.trim().toLowerCase() === 'slow dd')) {
                const id = makeMetasetId()
                nextMetas = nextMetas.concat({ id, name: 'Slow DD', sets: [ArtifactSet.Lethal, ArtifactSet.Savage, ArtifactSet.Stoneskin], show: true })
              }
            }
            for (let i = 0; i <= idx && i < steps.length; i++) {
              const sid = steps[i]?.id
              if (!sid) continue
              switch (sid) {
                case 'slots': {
                  nextBuilder = { ...nextBuilder, artifactTypes: [ArtifactType.Boots] }
                  break
                }
                case 'mainstat': {
                  nextBuilder = { ...nextBuilder, mainStatsV: [StatVariant.SPD] }
                  break
                }
                case 'sets': {
                  nextBuilder = { ...nextBuilder, artifactSets: [ArtifactSet.Speed] }
                  break
                }
                case 'add': {
                  // Add current builder as a new config
                  nextCfgs = nextCfgs.concat(nextBuilder)
                  nextSel = nextCfgs.length - 1
                  break
                }
                case 'adv-select-slots-main': {
                  nextBuilder = { ...nextBuilder, artifactTypes: [ArtifactType.Chestplate, ArtifactType.Boots], mainStatsV: [StatVariant.HP, StatVariant.ATK, StatVariant.DEF] }
                  break
                }
                case 'name': {
                  nextBuilder = { ...nextBuilder, name: 'DPS Core Rolls' }
                  break
                }
                case 'subs': {
                  nextBuilder = { ...nextBuilder, substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG], fixedSubstatsV: [StatVariant.CDMG] }
                  break
                }
                case 'required': {
                  nextBuilder = { ...nextBuilder, autoMinCount: false, minCount: 2 }
                  break
                }
                case 'min-rolls': {
                  nextBuilder = { ...nextBuilder, autoMinRequiredRolls: false, minRequiredRolls: 3 }
                  break
                }
                case 'metasets-add': {
                  ensureSlowDD()
                  break
                }
                case 'metasets-defaults': {
                  const wanted = new Set(['Nuker', 'Support - Debuffer', 'Support - Survivability'])
                  const defs = defaultMetasets().filter(m => wanted.has(m.name))
                  const have = new Set(nextMetas.map(m => m.name))
                  const add = defs.filter(d => !have.has(d.name))
                  if (add.length) nextMetas = nextMetas.concat(add)
                  break
                }
                case 'sets-metasets': {
                  ensureSlowDD()
                  const slow = nextMetas.find(m => m.name.trim().toLowerCase() === 'slow dd')
                  if (slow) nextBuilder = { ...nextBuilder, artifactMetaSets: [slow.id], artifactSets: [] }
                  break
                }
                case 'adv-add': {
                  nextCfgs = nextCfgs.concat(nextBuilder)
                  nextSel = nextCfgs.length - 1
                  break
                }
                case 'finalsell-dialog': {
                  nextFsr = { artifacts: true, accessories: false, levels: (nextFsr.levels?.length ? nextFsr.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16>)) }
                  break
                }
                default:
                  break
              }
            }
            // Commit reconstructed state
            setHsf(nextHsf)
            setCustomCfgs(nextCfgs)
            setSelectedCfgIdx(nextSel)
            setMetasets(nextMetas)
            setMinima(nextMinima)
            setFinalSellRemainder(nextFsr)
            setHsfrNote(nextNote)
            setBuilder(nextBuilder)
            setTutorialIdx(idx)
          } catch { setTutorialIdx(idx) }
        }}
        onClose={() => {
          // Ensure any tutorial-opened UI is closed before restoring and re-enabling autosave
          closeAllTransientUi()
          // Restore snapshot if present (do this before toggling tutorialOpen so autosave picks restored values)
          restoreFromTutorialSnapshot()
          setTutorialSnapshot(null)
          // Close the coach overlay last to keep autosave off until state is restored
          setTutorialOpen(false)
        }}
        onPrev={() => {
          try {
            const prev = Math.max(0, tutorialIdx - 1)
            const target = tutorialSteps[prev]
            if (target && target.id === 'sets-metasets') {
              // Reopen the Sets menu so the metasets section is visible when stepping back
              const openMenu = () => {
                try {
                  const sel = document.querySelector('[data-tour-id="builder.sets"] .MuiSelect-select') as HTMLElement | null
                  const el = sel || (document.querySelector('[data-tour-id="builder.sets"]') as HTMLElement | null)
                  if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
                } catch {}
              }
              openMenu()
              setTimeout(openMenu, 60)
            } else if (target && target.id === 'sets-open') {
              // Ensure menu is closed when stepping back to the step that precedes opening it
              try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
              setTimeout(() => {
                try {
                  const target = document.body as HTMLElement
                  const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit
                  target.dispatchEvent(new MouseEvent('mousedown', opts))
                  target.dispatchEvent(new MouseEvent('mouseup', opts))
                  target.dispatchEvent(new MouseEvent('click', opts))
                } catch {}
              }, 60)
            }
          } catch {}
          setTutorialIdx((i) => Math.max(0, i - 1))
        }}
        onNext={() => {
          // Perform one-time actions when advancing from specific steps
          try {
            const cur = tutorialSteps[tutorialIdx]
            if (cur?.id === 'add' && !tutorialAddedBasic) {
              // Click Add as new config for the basic example once
              setTutorialAddedBasic(true)
              const snap = builderRef.current
              setCustomCfgs(prev => {
                const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
                  ? selectedCfgIdx + 1
                  : prev.length
                const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
                setSelectedCfgIdx(insertIdx)
                return next
              })
            } else if (cur?.id === 'adv-add' && !tutorialAddedAdvanced) {
              // Click Add as new config for the advanced example once
              setTutorialAddedAdvanced(true)
              const snap = builderRef.current
              setCustomCfgs(prev => {
                const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
                  ? selectedCfgIdx + 1
                  : prev.length
                const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
                setSelectedCfgIdx(insertIdx)
                return next
              })
            } else if (cur?.id === 'metasets-add' && !tutorialAddedSlowDD) {
              // Create the Slow DD metaset with specific sets once
              setTutorialAddedSlowDD(true)
              setMetasets(prev => {
                // Avoid duplicates by name
                if (prev.some(m => m.name.trim().toLowerCase() === 'slow dd')) return prev
                const id = makeMetasetId()
                const next = prev.concat({ id, name: 'Slow DD', sets: [ArtifactSet.Lethal, ArtifactSet.Savage, ArtifactSet.Stoneskin], show: true })
                return next
              })
            } else if (cur?.id === 'sets-metasets') {
              // Select the Slow DD metaset and then click outside to close the multi-select menu
              try {
                const slow = metasets.find(m => m.name.trim().toLowerCase() === 'slow dd')
                if (slow) {
                  // Click the item visually in the open menu if present (for user feedback)
                  try {
                    const section = document.querySelector('[data-tour-id="menu.metasets.section"]') as HTMLElement | null
                    if (section) {
                      const items = Array.from(section.querySelectorAll('*')) as HTMLElement[]
                      const match = items.find(el => (el.textContent || '').trim().toLowerCase().includes('slow dd'))
                      match?.click()
                    }
                  } catch {}
                  // Also update builder state to be deterministic
                  setBuilder(prev => ({
                    ...prev,
                    artifactMetaSets: [slow.id],
                    artifactSets: [],
                  }))
                }
              } catch {}
              // Close robustly: send Escape to listbox, then synthetic mouse events outside
              try {
                window.setTimeout(() => {
                  try {
                    const list = document.querySelector('ul[role="listbox"]') as HTMLElement | null
                    if (list) list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
                  } catch {}
                  try {
                    const target = document.body as HTMLElement
                    const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit
                    target.dispatchEvent(new MouseEvent('mousedown', opts))
                    target.dispatchEvent(new MouseEvent('mouseup', opts))
                    target.dispatchEvent(new MouseEvent('click', opts))
                  } catch {}
                }, 60)
              } catch {}
            }
          } catch {}
          setTutorialIdx((i) => {
            const next = i + 1
            if (next >= tutorialSteps.length) {
              try { localStorage.setItem(TUTORIAL_SEEN_VERSION_KEY, APP_VERSION) } catch {}
              // Close transient UI first, then restore snapshot, then end tutorial
              closeAllTransientUi()
              restoreFromTutorialSnapshot()
              setTutorialSnapshot(null)
              setTutorialOpen(false)
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
