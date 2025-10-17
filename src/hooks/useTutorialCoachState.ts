import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { flushSync } from 'react-dom'

import { APP_VERSION } from '../version'
import { FINAL_SELL_DEFAULT_LEVELS, README_SEEN_VERSION_KEY, TUTORIAL_SEEN_VERSION_KEY } from '../lib/constants'
import { defaultMinima, type BuilderConfig, type MinimaTable } from '../lib/hsfBuilder'
import type { HsfFile } from '../lib/hsfTypes'
import { defaultMetasets, makeMetasetId, type Metaset } from '../lib/metasets'
import { DEFAULT_METASET_ICON_ID } from '../lib/metasetIcons'
import { FINAL_SELL_DEFAULT_SETS_MODE, type FinalSellRemainderConfig } from '../lib/finalSell'
import { ArtifactSet, ArtifactType, StatVariant } from '../lib/types'
import { DEFAULT_RULES_FILTER_STATE, type RulesFilterState } from '../lib/rulesFilter'
import type { TutorialStep } from '../components/tutorial/TutorialCoach'
import type { useI18n } from '../lib/i18n'

type Translate = ReturnType<typeof useI18n>['t']
type MinimaState = MinimaTable

type TutorialSnapshot = {
  hsf: HsfFile | null
  cfgs: BuilderConfig[]
  sel: number | null
  metas: Metaset[]
  mins: MinimaState
  fsr: FinalSellRemainderConfig
  note: string | null
  builder: BuilderConfig
  filterOpen: boolean
  rulesFilter: RulesFilterState
}

export type UseTutorialCoachStateParams = {
  hsf: HsfFile | null
  setHsf: Dispatch<SetStateAction<HsfFile | null>>
  customCfgs: BuilderConfig[]
  setCustomCfgs: Dispatch<SetStateAction<BuilderConfig[]>>
  selectedCfgIdx: number | null
  setSelectedCfgIdx: Dispatch<SetStateAction<number | null>>
  metasets: Metaset[]
  setMetasets: Dispatch<SetStateAction<Metaset[]>>
  minima: MinimaState
  setMinima: Dispatch<SetStateAction<MinimaState>>
  finalSellRemainder: FinalSellRemainderConfig
  setFinalSellRemainder: Dispatch<SetStateAction<FinalSellRemainderConfig>>
  hsfcNote: string | null
  setHsfcNote: Dispatch<SetStateAction<string | null>>
  builderRef: MutableRefObject<BuilderConfig>
  setBuilder: Dispatch<SetStateAction<BuilderConfig>>
  filterOpen: boolean
  setFilterOpen: Dispatch<SetStateAction<boolean>>
  rulesFilter: RulesFilterState
  setRulesFilter: Dispatch<SetStateAction<RulesFilterState>>
  setFinalSellOpen: Dispatch<SetStateAction<boolean>>
  t: Translate
}

export type UseTutorialCoachStateResult = {
  helpOpen: boolean
  setHelpOpen: Dispatch<SetStateAction<boolean>>
  helpFirstRunMode: boolean
  setHelpFirstRunMode: Dispatch<SetStateAction<boolean>>
  tutorialOpen: boolean
  tutorialSteps: TutorialStep[]
  tutorialIdx: number
  tutorialSections: Array<{ label: string; index: number }>
  startTutorial: () => void
  closeAllTransientUi: () => void
  handleTutorialSkipTo: (idx: number) => void
  handleTutorialClose: () => void
  handleTutorialPrev: () => void
  handleTutorialNext: () => void
}

/**
 * useTutorialCoachState
 *
 * Centralizes the tutorial/help walkthrough so App.tsx only forwards state to dialogs and the TutorialCoach overlay.
 * The hook keeps snapshot/restore, overlay guards, and one-time tutorial actions together to preserve existing behavior.
 */
export function useTutorialCoachState({
  hsf,
  setHsf,
  customCfgs,
  setCustomCfgs,
  selectedCfgIdx,
  setSelectedCfgIdx,
  metasets,
  setMetasets,
  minima,
  setMinima,
  finalSellRemainder,
  setFinalSellRemainder,
  hsfcNote,
  setHsfcNote,
  builderRef,
  setBuilder,
  filterOpen,
  setFilterOpen,
  rulesFilter,
  setRulesFilter,
  setFinalSellOpen,
  t,
}: UseTutorialCoachStateParams): UseTutorialCoachStateResult {
  const initialHelpFirstRun = useMemo(() => {
    try {
      return localStorage.getItem(README_SEEN_VERSION_KEY) !== APP_VERSION
    } catch {
      return false
    }
  }, [])

  const [helpOpen, setHelpOpen] = useState<boolean>(initialHelpFirstRun)
  const [helpFirstRunMode, setHelpFirstRunMode] = useState<boolean>(initialHelpFirstRun)
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(false)
  const [tutorialSteps, setTutorialSteps] = useState<TutorialStep[]>([])
  const [tutorialIdx, setTutorialIdx] = useState<number>(0)
  const [tutorialSections, setTutorialSections] = useState<Array<{ label: string; index: number }>>([])
  const [tutorialAddedBasic, setTutorialAddedBasic] = useState<boolean>(false)
  const [tutorialAddedAdvanced, setTutorialAddedAdvanced] = useState<boolean>(false)
  const [tutorialAddedSlowDD, setTutorialAddedSlowDD] = useState<boolean>(false)
  const [tutorialAddedAutoLate, setTutorialAddedAutoLate] = useState<boolean>(false)
  const [tutorialAddedDefaultMetas, setTutorialAddedDefaultMetas] = useState<boolean>(false)

  const tutorialTimersRef = useRef<{ setsMenuRetryId: number | null; setsMenuCloseId: number | null; scrollAnimId: number | null }>({ setsMenuRetryId: null, setsMenuCloseId: null, scrollAnimId: null })

  const previewLowerOverlayRef = useRef<HTMLDivElement | null>(null)
  const previewLowerOverlayCleanupRef = useRef<(() => void) | null>(null)
  const previewLowerOverlayRafRef = useRef<number | null>(null)

  const [tutorialSnapshot, setTutorialSnapshot] = useState<TutorialSnapshot | null>(null)

  const hsfRef = useRef(hsf)
  useEffect(() => { hsfRef.current = hsf }, [hsf])
  const cfgsRef = useRef(customCfgs)
  useEffect(() => { cfgsRef.current = customCfgs }, [customCfgs])
  const selRef = useRef(selectedCfgIdx)
  useEffect(() => { selRef.current = selectedCfgIdx }, [selectedCfgIdx])
  const metasRef = useRef(metasets)
  useEffect(() => { metasRef.current = metasets }, [metasets])
  const minimaRef = useRef(minima)
  useEffect(() => { minimaRef.current = minima }, [minima])
  const fsrRef = useRef(finalSellRemainder)
  useEffect(() => { fsrRef.current = finalSellRemainder }, [finalSellRemainder])
  const noteRef = useRef(hsfcNote)
  useEffect(() => { noteRef.current = hsfcNote }, [hsfcNote])
  const filterOpenRef = useRef(filterOpen)
  useEffect(() => { filterOpenRef.current = filterOpen }, [filterOpen])
  const rulesFilterRef = useRef<RulesFilterState>(rulesFilter)
  useEffect(() => { rulesFilterRef.current = rulesFilter }, [rulesFilter])

  const clearPreviewLowerHighlight = useCallback(() => {
    if (previewLowerOverlayCleanupRef.current) {
      try { previewLowerOverlayCleanupRef.current() } catch {}
      previewLowerOverlayCleanupRef.current = null
    }
    if (previewLowerOverlayRafRef.current !== null) {
      try { cancelAnimationFrame(previewLowerOverlayRafRef.current) } catch {}
      previewLowerOverlayRafRef.current = null
    }
    const overlay = previewLowerOverlayRef.current
    if (overlay) {
      try { overlay.remove() } catch {}
      previewLowerOverlayRef.current = null
    }
  }, [])

  const ensurePreviewLowerHighlight = useCallback((show: boolean) => {
    try {
      if (!show) {
        clearPreviewLowerHighlight()
        return
      }

      const container = document.querySelector('[data-tour-id="preview.table"]') as HTMLElement | null
      if (!container) {
        clearPreviewLowerHighlight()
        return
      }

      clearPreviewLowerHighlight()

      let overlay = previewLowerOverlayRef.current
      if (!overlay) {
        overlay = document.createElement('div')
        overlay.dataset.tourId = 'preview.table.lower'
        overlay.style.position = 'fixed'
        overlay.style.pointerEvents = 'none'
        overlay.style.background = 'transparent'
        overlay.style.opacity = '0'
        previewLowerOverlayRef.current = overlay
        document.body.appendChild(overlay)
      } else if (!document.body.contains(overlay)) {
        document.body.appendChild(overlay)
      }

      const scheduleUpdate = () => {
        const update = () => {
          const targetOverlay = previewLowerOverlayRef.current
          if (!targetOverlay || !container.isConnected) return
          try {
            const rect = container.getBoundingClientRect()
            targetOverlay.style.left = `${rect.left}px`
            targetOverlay.style.width = `${rect.width}px`
            const height = Math.max(0, rect.height - 96)
            targetOverlay.style.height = `${height}px`
            targetOverlay.style.top = `${rect.top + rect.height - height}px`
            targetOverlay.style.background = 'linear-gradient(to top, rgba(255,255,255,0.16), transparent)'
            targetOverlay.style.opacity = '1'
            targetOverlay.style.pointerEvents = 'none'
            targetOverlay.style.transition = 'opacity 160ms ease-in'
          } catch {}
        }
        update()
        previewLowerOverlayRafRef.current = requestAnimationFrame(() => {
          previewLowerOverlayRafRef.current = null
          update()
        })
      }

      const onResize = () => { scheduleUpdate() }
      const onScroll = () => { scheduleUpdate() }
      const onContainerScroll = () => { scheduleUpdate() }
      window.addEventListener('resize', onResize)
      window.addEventListener('scroll', onScroll, { capture: true, passive: true })
      container.addEventListener('scroll', onContainerScroll, { passive: true })
      previewLowerOverlayCleanupRef.current = () => {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('scroll', onScroll, true as unknown as undefined)
        container.removeEventListener('scroll', onContainerScroll)
        if (previewLowerOverlayRafRef.current !== null) {
          try { cancelAnimationFrame(previewLowerOverlayRafRef.current) } catch {}
          previewLowerOverlayRafRef.current = null
        }
      }
      scheduleUpdate()
      setTimeout(scheduleUpdate, 60)
    } catch {
      clearPreviewLowerHighlight()
    }
  }, [clearPreviewLowerHighlight])

  useEffect(() => () => { ensurePreviewLowerHighlight(false) }, [ensurePreviewLowerHighlight])

  const closeAllTransientUi = useCallback(() => {
    try {
      const pressEsc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      pressEsc(); setTimeout(pressEsc, 40)
    } catch {}
    try { ensurePreviewLowerHighlight(false) } catch {}
    try {
      setFinalSellOpen(false)
    } catch {}
    try {
      const listbox = document.querySelector('ul[role="listbox"]') as HTMLElement | null
      const menuEl = document.querySelector('[data-tour-id="chips.menu"]') as HTMLElement | null
      const chipMenuEl = document.querySelector('[data-tour-id="chip.menu"]') as HTMLElement | null
      const previewHeaderMenuEl = document.querySelector('[data-tour-id="preview.header.menu"]') as HTMLElement | null
      listbox?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      menuEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      const menuUl = menuEl?.querySelector('ul[role="menu"]') as HTMLElement | null
      menuUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      chipMenuEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      const chipUl = chipMenuEl?.querySelector('ul[role="menu"]') as HTMLElement | null
      chipUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      previewHeaderMenuEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      const previewHeaderUl = previewHeaderMenuEl?.querySelector('ul[role="menu"]') as HTMLElement | null
      previewHeaderUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    } catch {}
    try {
      const timers = tutorialTimersRef.current
      if (timers.setsMenuRetryId !== null) { clearTimeout(timers.setsMenuRetryId); timers.setsMenuRetryId = null }
      if (timers.scrollAnimId !== null) { try { cancelAnimationFrame(timers.scrollAnimId) } catch {} ; timers.scrollAnimId = null }
    } catch {}
    try {
      const btn = document.querySelector('[data-tour-id="metasets.close"]') as HTMLButtonElement | null
      btn?.click()
    } catch {}
    try {
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
  }, [ensurePreviewLowerHighlight, setFinalSellOpen])

  const restoreFromTutorialSnapshot = useCallback(() => {
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
        setHsfcNote(snap.note)
        setBuilder(snap.builder)
        setFilterOpen(snap.filterOpen)
        setRulesFilter(JSON.parse(JSON.stringify(snap.rulesFilter)) as RulesFilterState)
      })
    } catch {}
  }, [setBuilder, setCustomCfgs, setFinalSellRemainder, setFilterOpen, setHsf, setHsfcNote, setMetasets, setMinima, setRulesFilter, setSelectedCfgIdx, tutorialSnapshot])

  const startTutorial = useCallback(() => {
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

    const isSetsMenuOpen = () => {
      try {
        const selectRoot = document.querySelector('[data-tour-id="builder.sets"]') as HTMLElement | null
        if (!selectRoot) return false
        // The Sets selector is considered open when its combobox reports `aria-expanded`
        // or when the menu it controls is mounted and visible in the DOM.
        if (selectRoot.getAttribute('aria-expanded') === 'true') return true
        const expandedChild = selectRoot.querySelector('[aria-expanded="true"]')
        if (expandedChild) return true
        const controlIds = new Set<string>()
        const collectControls = (node: Element | null) => {
          if (!node) return
          const controlId = node.getAttribute('aria-controls')
          if (controlId) controlIds.add(controlId)
        }
        collectControls(selectRoot)
        selectRoot.querySelectorAll('[aria-controls]').forEach((el) => collectControls(el))
        for (const id of controlIds) {
          const menu = document.getElementById(id)
          if (!menu) continue
          if (menu.getAttribute('aria-hidden') === 'true') continue
          const rect = menu.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) return true
        }
      } catch {}
      return false
    }
    const ensureSetsMenu = (open: boolean) => {
      try {
        const openNow = isSetsMenuOpen()
        const timers = tutorialTimersRef.current
        if (timers.setsMenuCloseId !== null) { try { clearTimeout(timers.setsMenuCloseId) } catch {} ; timers.setsMenuCloseId = null }
        if (open && !openNow) {
          const selEl = document.querySelector('[data-tour-id="builder.sets"] .MuiSelect-select') as HTMLElement | null
          const trigger = selEl || (document.querySelector('[data-tour-id="builder.sets"]') as HTMLElement | null)
          if (trigger) trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
        } else if (!open) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          try { (document.querySelector('ul[role="listbox"]') as HTMLElement | null)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
          timers.setsMenuCloseId = window.setTimeout(() => {
            try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
            timers.setsMenuCloseId = null
          }, 40)
          if (timers.setsMenuRetryId !== null) { try { clearTimeout(timers.setsMenuRetryId) } catch {} ; timers.setsMenuRetryId = null }
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
            const rect = el.getBoundingClientRect()
            el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }))
          }
        } else if (!open) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          try {
            const menuEls = [
              document.querySelector('[data-tour-id="chips.menu"]') as HTMLElement | null,
              document.querySelector('[data-tour-id="chip.menu"]') as HTMLElement | null,
            ]
            for (const menuEl of menuEls) {
              menuEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
              const menuUl = menuEl?.querySelector('ul[role="menu"]') as HTMLElement | null
              menuUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            }
          } catch {}
          setTimeout(() => {
            try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
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

    const isPreviewHeaderMenuOpen = () => Boolean(document.querySelector('[data-tour-id="preview.header.menu"]'))
    const ensurePreviewHeaderMenu = (open: boolean) => {
      try {
        const openNow = isPreviewHeaderMenuOpen()
        if (open && !openNow) {
          const head = document.querySelector('[data-tour-id="preview.header"]') as HTMLElement | null
          const el = head ?? (document.querySelector('[data-tour-id="preview.table"] thead') as HTMLElement | null)
          if (el) {
            const rect = el.getBoundingClientRect()
            el.dispatchEvent(new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: rect.left + Math.min(40, Math.max(8, rect.width / 3)),
              clientY: rect.top + Math.min(12, Math.max(8, rect.height / 2)),
            }))
          }
        } else if (!open) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          try {
            const menu = document.querySelector('[data-tour-id="preview.header.menu"]') as HTMLElement | null
            menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            const ul = menu?.querySelector('ul[role="menu"]') as HTMLElement | null
            ul?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          } catch {}
          setTimeout(() => {
            try {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
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

    const smoothScrollPreviewToEnd = () => {
      try {
        const container = document.querySelector('[data-tour-id="preview.table"]') as HTMLElement | null
        if (!container) return
        try { container.scrollTop = 0 } catch {}
        const startTop = container.scrollTop
        const endTop = Math.max(0, container.scrollHeight - container.clientHeight)
        if (endTop <= startTop) return
        const DURATION_MS = 2400
        const startAt = performance.now()
        const easeInOut = (time: number) => (time < 0.5 ? 2 * time * time : -1 + (4 - 2 * time) * time)
        const timers = tutorialTimersRef.current
        const step = (now: number) => {
          const p = Math.min(1, (now - startAt) / DURATION_MS)
          const eased = easeInOut(p)
          const nextTop = Math.round(startTop + (endTop - startTop) * eased)
          try { container.scrollTop = nextTop } catch {}
          if (p < 1) { timers.scrollAnimId = requestAnimationFrame(step) } else { timers.scrollAnimId = null }
        }
        if (timers.scrollAnimId !== null) { try { cancelAnimationFrame(timers.scrollAnimId) } catch {} ; timers.scrollAnimId = null }
        timers.scrollAnimId = requestAnimationFrame(step)
      } catch {}
    }

    try {
      const cloneHsf = hsfRef.current ? (JSON.parse(JSON.stringify(hsfRef.current)) as HsfFile) : null
      const srcCfgs = cfgsRef.current
      const srcMetas = metasRef.current
      const srcMinima = minimaRef.current
      const srcFsr = fsrRef.current
      const srcBuilder = builderRef.current
      const cloneCfgs = srcCfgs.map((cfg) => ({ ...cfg }))
      const cloneMetas = srcMetas.map((meta) => ({ ...meta, sets: meta.sets.slice() }))
      const cloneMinima = JSON.parse(JSON.stringify(srcMinima)) as MinimaState
      const cloneFsr = JSON.parse(JSON.stringify(srcFsr)) as FinalSellRemainderConfig
      const cloneBuilder = JSON.parse(JSON.stringify(srcBuilder)) as BuilderConfig
      const cloneRulesFilter = JSON.parse(JSON.stringify(rulesFilterRef.current)) as RulesFilterState
      setTutorialSnapshot({
        hsf: cloneHsf,
        cfgs: cloneCfgs,
        sel: selRef.current,
        metas: cloneMetas,
        mins: cloneMinima,
        fsr: cloneFsr,
        note: noteRef.current,
        builder: cloneBuilder,
        filterOpen: filterOpenRef.current,
        rulesFilter: cloneRulesFilter,
      })
    } catch {}

    try {
      setHsf(null)
      setCustomCfgs([])
      setSelectedCfgIdx(null)
      setMetasets([])
      setMinima(defaultMinima())
      setFinalSellRemainder({ artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0 | 4 | 8 | 12 | 16>, setsMode: FINAL_SELL_DEFAULT_SETS_MODE })
      setHsfcNote(null)
      setBuilder({
        name: '',
        keep: true,
        visibility: 'enabled',
        rankCode: 0,
        rarityCode: 0,
        rarityMode: 'auto',
        factionCode: 0,
        mainStatsV: [],
        minLevel: 0,
        maxLevel: 16,
        earlyKeepMode: 'early',
        rollBaseline: 'afterStart',
        rollMode: 'auto',
        substatsV: [],
        fixedSubstatsV: [],
        minCount: 0,
        autoMinCount: true,
        autoSubstatFlex: false,
        minRequiredRolls: 0,
        autoMinRequiredRolls: true,
      })
      setFilterOpen(false)
      setRulesFilter(JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState)
    } catch {}

    setTutorialIdx(0)
    setTutorialAddedBasic(false)
    setTutorialAddedAdvanced(false)
    setTutorialAddedSlowDD(false)
    setTutorialAddedDefaultMetas(false)
    setTutorialAddedAutoLate(false)

    const basic: TutorialStep[] = [
      {
        id: 'welcome',
        title: t('tutWelcomeTitle'),
        body: t('tutWelcomeBody'),
        targetId: 'builder.panel',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false) },
      },
      {
        id: 'action',
        title: t('tutActionTitle'),
        body: t('tutActionBody'),
        targetIds: ['builder.action.keep', 'builder.action.sell'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false) },
      },
      {
        id: 'enabled',
        title: t('tutEnabledTitle'),
        body: t('tutEnabledBody'),
        targetId: 'builder.sellfileMode',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'basics',
        title: t('tutBasicsTitle'),
        body: t('tutBasicsBody'),
        targetIds: ['builder.rank', 'builder.rarity', 'builder.faction', 'builder.min-level', 'builder.max-level'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'slots',
        title: t('tutSlotsTitle'),
        body: t('tutSlotsBody'),
        targetId: 'builder.slot.boots',
        before: () => setBuilder((prev) => ({ ...prev, artifactTypes: [ArtifactType.Boots] })),
      },
      {
        id: 'mainstat',
        title: t('tutMainTitle'),
        body: t('tutMainBody'),
        targetId: 'builder.mainstat.spd',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false)
          setBuilder((prev) => ({ ...prev, mainStatsV: [StatVariant.SPD] }))
        },
      },
      {
        id: 'sets',
        title: t('tutSetsTitle'),
        body: t('tutSetsBody'),
        targetId: 'builder.sets',
        before: () => {
          ensureMetasetsDialog(false); ensureChipsMenu(false); ensureSetsMenu(false)
          setBuilder((prev) => ({ ...prev, artifactSets: [ArtifactSet.Speed] }))
        },
      },
      {
        id: 'add',
        title: t('tutAddConfigTitle'),
        body: t('tutAddConfigBody'),
        targetId: 'builder.add-config',
      },
      {
        id: 'added',
        title: t('tutConfigAddedTitle'),
        body: t('tutConfigAddedBody'),
        targetIds: ['chip.selected', 'builder.add-config'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'preview-locate',
        title: t('tutSeeRulesTitle'),
        body: t('tutSeeRulesBody'),
        targetId: 'preview.paper',
      },
    ]

    const advanced: TutorialStep[] = [
      {
        id: 'adv-intro',
        title: t('tutAdvIntroTitle'),
        body: t('tutAdvIntroBody'),
        targetId: 'builder.panel',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'adv-select-slots-main',
        title: t('tutAdvSelectSlotsMainTitle'),
        body: t('tutAdvSelectSlotsMainBody'),
        targetIds: ['builder.slots', 'builder.mainstat'],
        before: () => setBuilder((prev) => ({
          ...prev,
          artifactTypes: [ArtifactType.Chestplate, ArtifactType.Boots],
          mainStatsV: [StatVariant.HP, StatVariant.ATK, StatVariant.DEF],
        })),
      },
      {
        id: 'name',
        title: t('tutAdvNameTitle'),
        body: t('tutAdvNameBody'),
        targetId: 'builder.name',
        before: () => setBuilder((prev) => ({ ...prev, name: 'DPS Core Rolls' })),
      },
      {
        id: 'subs',
        title: t('tutAdvChooseSubstatsTitle'),
        body: t('tutAdvChooseSubstatsBody'),
        targetId: 'builder.substats',
        before: () => setBuilder((prev) => ({
          ...prev,
          substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
          fixedSubstatsV: [StatVariant.CDMG],
        })),
      },
      {
        id: 'min-rolls',
        title: t('tutAdvMinRollsTitle'),
        body: t('tutAdvMinRollsBody'),
        targetIds: ['builder.min-rolls.label', 'builder.min-rolls', 'builder.min-rolls.toggle'],
        before: () => setBuilder((prev) => ({ ...prev, autoMinRequiredRolls: false, minRequiredRolls: 3 })),
      },
      {
        id: 'required',
        title: t('tutAdvRequiredTitle'),
        body: t('tutAdvRequiredBody'),
        targetIds: ['builder.required.label', 'builder.required', 'builder.flex-chip'],
        before: () => {
          setBuilder((prev) => ({ ...prev, autoMinCount: false, autoSubstatFlex: false, minCount: 2 }))
          setTimeout(() => {
            try { setBuilder((prev) => ({ ...prev, autoSubstatFlex: false })) } catch {}
          }, 0)
        },
      },
      {
        id: 'thresholds',
        title: t('builderMilestoneThresholds'),
        body: t('tutAdvMilestonesBody'),
        targetIds: ['builder.thresholds.label', 'builder.thresholds', 'builder.thresholds.auto-chip'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-open',
        title: t('tutMetasetsManageTitle'),
        body: t('tutMetasetsManageBody'),
        targetId: 'builder.manage-metasets',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-add',
        title: t('tutMetasetsAddTitle'),
        body: t('tutMetasetsAddBody'),
        targetId: 'metasets.add',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-added',
        title: t('tutMetasetsAddedTitle'),
        body: t('tutMetasetsAddedBody'),
        targetId: 'metasets.dialog',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-defaults',
        title: t('tutMetasetsIncludedTitle'),
        body: t('tutMetasetsIncludedBody'),
        targetId: 'metasets.dialog',
        before: () => {
          ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false)
          if (!tutorialAddedDefaultMetas) {
            const wanted = new Set(['Nuker', 'Support - Debuffer', 'Support - Survivability'])
            const defs = defaultMetasets().filter((meta) => wanted.has(meta.name))
            setMetasets((prev) => {
              const have = new Set(prev.map((meta) => meta.name))
              const add = defs.filter((meta) => !have.has(meta.name))
              return add.length ? prev.concat(add) : prev
            })
            setTutorialAddedDefaultMetas(true)
          }
        },
      },
      {
        id: 'metasets-close',
        title: t('tutMetasetsCloseTitle'),
        body: t('tutMetasetsCloseBody'),
        targetId: 'metasets.close',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'sets-open',
        title: t('tutMetasetsSelectTitle'),
        body: t('tutMetasetsSelectBody'),
        targetId: 'builder.sets',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'sets-metasets',
        title: t('tutMetasetsInSetsTitle'),
        body: t('tutMetasetsInSetsBody'),
        targetId: 'menu.metasets.section',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(true); ensureChipsMenu(false)
          const timers = tutorialTimersRef.current
          if (timers.setsMenuRetryId !== null) { try { clearTimeout(timers.setsMenuRetryId) } catch {} ; timers.setsMenuRetryId = null }
          timers.setsMenuRetryId = window.setTimeout(() => { try { ensureSetsMenu(true) } catch {} }, 60)
        },
      },
      {
        id: 'adv-add',
        title: t('tutAdvAddTitle'),
        body: t('tutAdvAddBody'),
        targetId: 'builder.add-config',
      },
      {
        id: 'adv-added',
        title: t('tutAdvAddedTitle'),
        body: t('tutAdvAddedBody'),
        targetId: 'chips.container',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'adv-preview-early',
        title: t('tutAdvPreviewEarlyTitle'),
        body: t('tutAdvPreviewEarlyBody'),
        targetId: 'preview.table',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewLowerHighlight(false)
          setTimeout(() => { try { smoothScrollPreviewToEnd() } catch {} }, 120)
        },
      },
      {
        id: 'chips',
        title: t('tutConfigChipsTitle'),
        body: t('tutConfigChipsBody'),
        targetIds: ['chip.selected', 'chip.menu'],
        expand: 10,
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false)
          try {
            const el = document.querySelector('[data-tour-id="chips.container"]') as HTMLElement | null
            el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
          } catch {}
          try {
            const chip = document.querySelector('[data-tour-id="chip.selected"]') as HTMLElement | null
            if (chip) {
              const rect = chip.getBoundingClientRect()
              chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }))
            }
          } catch {}
        },
      },
      {
        id: 'auto-late-intro',
        title: t('tutAutoLateIntroTitle'),
        body: t('tutAutoLateIntroBody'),
        targetIds: ['builder.slots', 'builder.rarity.auto', 'builder.early-mode.late'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewLowerHighlight(false)
          setBuilder((prev) => ({
            ...prev,
            name: 'Banner SPD — Late 3 rolls',
            artifactTypes: [ArtifactType.Banner],
            mainStatsV: [],
            substatsV: [StatVariant.SPD],
            fixedSubstatsV: [],
            autoMinCount: false,
            autoSubstatFlex: false,
            minCount: 1,
            autoMinRequiredRolls: false,
            minRequiredRolls: 3,
            rarityCode: 0,
            rarityMode: 'auto',
            earlyKeepMode: 'late',
          }))
        },
      },
      {
        id: 'auto-late-name',
        title: t('tutAutoLateNameTitle'),
        body: t('tutAutoLateNameBody'),
        targetId: 'builder.name',
      },
      {
        id: 'auto-late-levels',
        title: t('tutAutoLateLevelsTitle'),
        body: t('tutAutoLateLevelsBody'),
        targetIds: ['builder.min-level', 'builder.max-level', 'builder.early-mode'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'auto-late-add',
        title: t('tutAutoLateAddTitle'),
        body: t('tutAutoLateAddBody'),
        targetId: 'builder.insert-config',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'preview-filter',
        title: t('tutPreviewFilterTitle'),
        body: t('tutPreviewFilterBody'),
        targetIds: ['preview.filter', 'preview.filter.apply'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewLowerHighlight(false) },
      },
      {
        id: 'preview-highlight',
        title: t('tutPreviewHighlightTitle'),
        body: t('tutPreviewHighlightBody'),
        targetId: 'preview.table.lower',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewLowerHighlight(true) },
      },
      {
        id: 'preview-header-menu-open',
        title: t('tutPreviewHeaderOpenTitle'),
        body: t('tutPreviewHeaderOpenBody'),
        targetId: 'preview.header',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false); ensurePreviewHeaderMenu(true); ensurePreviewLowerHighlight(false) },
      },
      {
        id: 'preview-header-menu-close',
        title: t('tutPreviewHeaderCloseTitle'),
        body: t('tutPreviewHeaderCloseBody'),
        targetId: 'preview.header',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false); ensurePreviewHeaderMenu(false); ensurePreviewLowerHighlight(false) },
      },
      {
        id: 'finalsell-intro',
        title: t('tutFinalSellIntroTitle'),
        body: t('tutFinalSellIntroBody'),
        targetId: 'finalsell.toggle',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false); ensurePreviewLowerHighlight(false) },
      },
      {
        id: 'finalsell-config',
        title: t('tutFinalSellConfigureTitle'),
        body: t('tutFinalSellConfigureBody'),
        targetId: 'finalsell.config',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false); ensurePreviewLowerHighlight(false) },
      },
      {
        id: 'finalsell-dialog',
        title: t('tutFinalSellDialogTitle'),
        body: t('tutFinalSellDialogBody'),
        targetIds: ['finalsell.dialog', 'finalsell.dialog.types', 'finalsell.dialog.levels'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewLowerHighlight(false)
          try {
            setFinalSellOpen(true)
            setFinalSellRemainder((prev) => {
              const safePrev = prev ?? { artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0 | 4 | 8 | 12 | 16>, setsMode: FINAL_SELL_DEFAULT_SETS_MODE }
              const levels = safePrev.levels?.length ? safePrev.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0 | 4 | 8 | 12 | 16>)
              return { ...safePrev, artifacts: true, accessories: false, levels }
            })
          } catch {}
        },
      },
      {
        id: 'note',
        title: t('tutNoteTitle'),
        body: t('tutNoteBody'),
        targetId: 'note.toggle',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false); ensurePreviewLowerHighlight(false) },
      },
      {
        id: 'save-explain',
        title: t('tutSaveExplainTitle'),
        body: t('tutSaveExplainBody'),
        targetId: 'hsfc.save',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHeaderMenu(false); ensurePreviewLowerHighlight(false); try { setFinalSellOpen(false) } catch {} },
      },
      {
        id: 'preview',
        title: t('tutPreviewFinishTitle'),
        body: t('tutPreviewFinishBody'),
        targetId: 'preview.paper',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHeaderMenu(false); ensurePreviewLowerHighlight(false); try { setFinalSellOpen(false) } catch {} },
      },
      {
        id: 'export-explain',
        title: t('tutExportExplainTitle'),
        body: t('tutExportExplainBody'),
        targetId: 'hsf.export',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHeaderMenu(false); ensurePreviewLowerHighlight(false); try { setFinalSellOpen(false) } catch {} },
      },
      {
        id: 'preview-header-menu',
        title: t('tutPreviewHeaderMenuTitle'),
        body: t('tutPreviewHeaderMenuBody'),
        targetIds: ['preview.header', 'preview.header.menu'],
        expand: 10,
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false); ensurePreviewHeaderMenu(true); ensurePreviewLowerHighlight(false) },
      },
    ]

    const steps = [...basic, ...advanced]
    setTutorialSteps(steps)
    const find = (id: string) => steps.findIndex((step) => step.id === id)
    const sections: Array<{ label: string; index: number }> = [
      { label: t('tutSectionBasicsLabel'), index: find('welcome') },
      { label: t('tutSectionAdvancedLabel'), index: find('adv-intro') },
      { label: t('tutSectionMetasetsLabel'), index: find('metasets-open') },
      { label: t('tutSectionConfigChipsLabel'), index: find('adv-add') },
      { label: t('tutSectionAutoLateLabel'), index: find('auto-late-intro') },
      { label: t('tutSectionFinalSellLabel'), index: find('finalsell-intro') },
      { label: t('tutSectionSaveExportLabel'), index: find('note') },
    ].filter((section) => section.index >= 0)
    setTutorialSections(sections)
    setTutorialOpen(true)
  }, [
    builderRef,
    ensurePreviewLowerHighlight,
    setBuilder,
    setCustomCfgs,
    setFinalSellOpen,
    setFinalSellRemainder,
    setFilterOpen,
    setHsfcNote,
    setHsf,
    setMetasets,
    setMinima,
    setRulesFilter,
    setSelectedCfgIdx,
    setTutorialAddedAutoLate,
    setTutorialAddedAdvanced,
    setTutorialAddedBasic,
    setTutorialAddedDefaultMetas,
    setTutorialAddedSlowDD,
    setTutorialIdx,
    setTutorialOpen,
    setTutorialSections,
    setTutorialSnapshot,
    setTutorialSteps,
    t,
    tutorialAddedDefaultMetas,
  ])

  const handleTutorialSkipTo = useCallback((idx: number) => {
    try {
      closeAllTransientUi()
      const steps = tutorialSteps
      let nextHsf: HsfFile | null = null
      let nextCfgs: BuilderConfig[] = []
      let nextSel: number | null = null
      let nextMetas: Metaset[] = []
      let nextMinima = defaultMinima()
      let nextFsr: FinalSellRemainderConfig = {
        artifacts: false,
        accessories: false,
        levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0 | 4 | 8 | 12 | 16>,
        setsMode: FINAL_SELL_DEFAULT_SETS_MODE,
      }
      let nextNote: string | null = null
      let nextBuilder: BuilderConfig = {
        name: '',
        keep: true,
        visibility: 'enabled',
        rankCode: 0,
        rarityCode: 0,
        rarityMode: 'auto',
        factionCode: 0,
        mainStatsV: [],
        minLevel: 0,
        maxLevel: 16,
        earlyKeepMode: 'early',
        rollBaseline: 'afterStart',
        rollMode: 'auto',
        substatsV: [],
        fixedSubstatsV: [],
        minCount: 0,
        autoMinCount: true,
        autoSubstatFlex: false,
        minRequiredRolls: 0,
        autoMinRequiredRolls: true,
      }
      const ensureSlowDD = () => {
        if (!nextMetas.some((meta) => meta.name.trim().toLowerCase() === 'slow dd')) {
          const id = makeMetasetId()
          nextMetas = nextMetas.concat({ id, name: 'Slow DD', sets: [ArtifactSet.Lethal, ArtifactSet.Savage, ArtifactSet.Stoneskin], show: true, iconId: DEFAULT_METASET_ICON_ID })
        }
      }
      for (let i = 0; i <= idx && i < steps.length; i += 1) {
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
            nextCfgs = nextCfgs.concat(nextBuilder)
            nextSel = nextCfgs.length - 1
            break
          }
          case 'adv-select-slots-main': {
            nextBuilder = {
              ...nextBuilder,
              artifactTypes: [ArtifactType.Chestplate, ArtifactType.Boots],
              mainStatsV: [StatVariant.HP, StatVariant.ATK, StatVariant.DEF],
            }
            break
          }
          case 'name': {
            nextBuilder = { ...nextBuilder, name: 'DPS Core Rolls' }
            break
          }
          case 'subs': {
            nextBuilder = {
              ...nextBuilder,
              substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
              fixedSubstatsV: [StatVariant.CDMG],
            }
            break
          }
          case 'required': {
            nextBuilder = { ...nextBuilder, autoMinCount: false, autoSubstatFlex: false, minCount: 2 }
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
            const defs = defaultMetasets().filter((meta) => wanted.has(meta.name))
            const have = new Set(nextMetas.map((meta) => meta.name))
            const add = defs.filter((meta) => !have.has(meta.name))
            if (add.length) nextMetas = nextMetas.concat(add)
            break
          }
          case 'sets-metasets': {
            ensureSlowDD()
            const slow = nextMetas.find((meta) => meta.name.trim().toLowerCase() === 'slow dd')
            if (slow) nextBuilder = { ...nextBuilder, artifactMetaSets: [slow.id], artifactSets: [] }
            break
          }
          case 'adv-add': {
            nextCfgs = nextCfgs.concat(nextBuilder)
            nextSel = nextCfgs.length - 1
            break
          }
          case 'auto-late-intro': {
            nextBuilder = {
              ...nextBuilder,
              name: 'Banner SPD — Late 3 rolls',
              artifactTypes: [ArtifactType.Banner],
              mainStatsV: [],
              substatsV: [StatVariant.SPD],
              fixedSubstatsV: [],
              autoMinCount: false,
              autoSubstatFlex: false,
              minCount: 1,
              autoMinRequiredRolls: false,
              minRequiredRolls: 3,
              rarityCode: 0,
              rarityMode: 'auto',
              earlyKeepMode: 'late',
            }
            break
          }
          case 'auto-late-add': {
            nextCfgs = nextCfgs.concat(nextBuilder)
            nextSel = nextCfgs.length - 1
            break
          }
          case 'finalsell-dialog': {
            const levels = nextFsr.levels?.length ? nextFsr.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0 | 4 | 8 | 12 | 16>)
            nextFsr = { ...nextFsr, artifacts: true, accessories: false, levels }
            break
          }
          default:
            break
        }
      }
      setHsf(nextHsf)
      setCustomCfgs(nextCfgs)
      setSelectedCfgIdx(nextSel)
      setMetasets(nextMetas)
      setMinima(nextMinima)
      setFinalSellRemainder(nextFsr)
      setHsfcNote(nextNote)
      setBuilder(nextBuilder)
      setTutorialIdx(idx)
    } catch {
      setTutorialIdx(idx)
    }
  }, [
    closeAllTransientUi,
    setBuilder,
    setCustomCfgs,
    setFinalSellRemainder,
    setHsf,
    setHsfcNote,
    setMetasets,
    setMinima,
    setSelectedCfgIdx,
    tutorialSteps,
  ])

  const handleTutorialClose = useCallback(() => {
    closeAllTransientUi()
    restoreFromTutorialSnapshot()
    setTutorialSnapshot(null)
    setTutorialOpen(false)
  }, [closeAllTransientUi, restoreFromTutorialSnapshot])

  const handleTutorialPrev = useCallback(() => {
    try {
      const prevIdx = Math.max(0, tutorialIdx - 1)
      const target = tutorialSteps[prevIdx]
      if (target && target.id === 'sets-metasets') {
        const openMenu = () => {
          try {
            const selEl = document.querySelector('[data-tour-id="builder.sets"] .MuiSelect-select') as HTMLElement | null
            const trigger = selEl || (document.querySelector('[data-tour-id="builder.sets"]') as HTMLElement | null)
            if (trigger) trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
          } catch {}
        }
        openMenu()
        setTimeout(openMenu, 60)
      } else if (target && target.id === 'sets-open') {
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
        setTimeout(() => {
          try {
            const targetEl = document.body as HTMLElement
            const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit
            targetEl.dispatchEvent(new MouseEvent('mousedown', opts))
            targetEl.dispatchEvent(new MouseEvent('mouseup', opts))
            targetEl.dispatchEvent(new MouseEvent('click', opts))
          } catch {}
        }, 60)
      }
    } catch {}
    setTutorialIdx((value) => Math.max(0, value - 1))
  }, [tutorialIdx, tutorialSteps])

  const handleTutorialNext = useCallback(() => {
    try {
      const cur = tutorialSteps[tutorialIdx]
      if (cur?.id === 'add' && !tutorialAddedBasic) {
        setTutorialAddedBasic(true)
        const snap = builderRef.current
        setCustomCfgs((prev) => {
          const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
            ? selectedCfgIdx + 1
            : prev.length
          const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
          setSelectedCfgIdx(insertIdx)
          return next
        })
      } else if (cur?.id === 'adv-add' && !tutorialAddedAdvanced) {
        setTutorialAddedAdvanced(true)
        const snap = builderRef.current
        setCustomCfgs((prev) => {
          const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
            ? selectedCfgIdx + 1
            : prev.length
          const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
          setSelectedCfgIdx(insertIdx)
          return next
        })
      } else if (cur?.id === 'metasets-add' && !tutorialAddedSlowDD) {
        setTutorialAddedSlowDD(true)
        setMetasets((prev) => {
          if (prev.some((meta) => meta.name.trim().toLowerCase() === 'slow dd')) return prev
          const id = makeMetasetId()
          return prev.concat({ id, name: 'Slow DD', sets: [ArtifactSet.Lethal, ArtifactSet.Savage, ArtifactSet.Stoneskin], show: true, iconId: DEFAULT_METASET_ICON_ID })
        })
      } else if (cur?.id === 'sets-metasets') {
        try {
          const slow = metasets.find((meta) => meta.name.trim().toLowerCase() === 'slow dd')
          if (slow) {
            try {
              const section = document.querySelector('[data-tour-id="menu.metasets.section"]') as HTMLElement | null
              if (section) {
                const items = Array.from(section.querySelectorAll('*')) as HTMLElement[]
                const match = items.find((el) => (el.textContent || '').trim().toLowerCase().includes('slow dd'))
                match?.click()
              }
            } catch {}
            setBuilder((prev) => ({
              ...prev,
              artifactMetaSets: [slow.id],
              artifactSets: [],
            }))
          }
        } catch {}
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
      } else if (cur?.id === 'auto-late-add' && !tutorialAddedAutoLate) {
        setTutorialAddedAutoLate(true)
        const snap = builderRef.current
        setCustomCfgs((prev) => {
          const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
            ? selectedCfgIdx + 1
            : prev.length
          const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
          setSelectedCfgIdx(insertIdx)
          return next
        })
      }
    } catch {}
    setTutorialIdx((value) => {
      const next = value + 1
      if (next >= tutorialSteps.length) {
        try { localStorage.setItem(TUTORIAL_SEEN_VERSION_KEY, APP_VERSION) } catch {}
        closeAllTransientUi()
        restoreFromTutorialSnapshot()
        setTutorialSnapshot(null)
        setTutorialOpen(false)
        return value
      }
      return next
    })
  }, [
    builderRef,
    closeAllTransientUi,
    metasets,
    restoreFromTutorialSnapshot,
    selectedCfgIdx,
    setBuilder,
    setCustomCfgs,
    setMetasets,
    setSelectedCfgIdx,
    setTutorialAddedAdvanced,
    setTutorialAddedAutoLate,
    setTutorialAddedBasic,
    setTutorialAddedSlowDD,
    setTutorialIdx,
    setTutorialOpen,
    setTutorialSnapshot,
    tutorialAddedAdvanced,
    tutorialAddedAutoLate,
    tutorialAddedBasic,
    tutorialAddedSlowDD,
    tutorialIdx,
    tutorialSteps,
  ])

  return {
    helpOpen,
    setHelpOpen,
    helpFirstRunMode,
    setHelpFirstRunMode,
    tutorialOpen,
    tutorialSteps,
    tutorialIdx,
    tutorialSections,
    startTutorial,
    closeAllTransientUi,
    handleTutorialSkipTo,
    handleTutorialClose,
    handleTutorialPrev,
    handleTutorialNext,
  }
}
