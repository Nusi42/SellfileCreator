import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { flushSync } from 'react-dom'

import { APP_VERSION } from '../version'
import { ACCESSORY_NO_SET_ID, FINAL_SELL_DEFAULT_LEVELS, README_SEEN_VERSION_KEY, TUTORIAL_SEEN_VERSION_KEY } from '../lib/constants'
import { defaultSubstatTargets, type BuilderRecipe, type SubstatTargetTable } from '../lib/hsfBuilder'
import { cloneBuilderRecipe } from '../lib/recipeMultiEditDraft'
import type { HsfFile } from '../lib/hsfTypes'
import { defaultMetasets, type Metaset } from '../lib/metasets'
import { DEFAULT_METASET_ICON_ID } from '../lib/metasetIcons'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  LOGIC_HUB_DIALOG_TAB_FINAL_SELL,
  LOGIC_HUB_DIALOG_TAB_GEAR,
  type LogicHubDialogTab,
  type FinalSellRemainderConfig,
} from '../lib/logicHub'
import { ArtifactSet, ArtifactType, Faction, StatVariant, RankCode, RarityCode, LEVEL_MILESTONES, type LevelMilestone } from '../lib/types'
import type { TutorialStep } from '../components/tutorial/TutorialCoach'
import {
  resetRulesFilterPreferences,
  snapshotRulesFilterPreferences,
  restoreRulesFilterPreferencesSnapshot,
  type RulesFilterPreferencesSnapshot,
} from '../state/rulesFilterPersistence'
import {
  snapshotGearInspectorSubstatSort,
  restoreGearInspectorSubstatSortSnapshot,
  clearGearInspectorSubstatSortStandalone,
  type GearInspectorSubstatSortState,
} from '../state/gearInspectorSubstatSortPreferences'
import {
  snapshotSafeguardImprovementChance,
  restoreSafeguardImprovementChance,
} from '../state/gearInspectorGridPreferences'
import {
  resetBuilderCollapsedPreferences,
  snapshotBuilderCollapsedPreferences,
  restoreBuilderCollapsedPreferencesSnapshot,
  type BuilderCollapsedPreferencesSnapshot,
} from '../state/builderPreferences'
import type { useI18n } from '../lib/i18n'
import {
  SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD,
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
  SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  type SafeguardRule,
} from '../lib/safeguards'
import type { GearInspectorItem } from '../lib/gearInspectorSession'

type Translate = ReturnType<typeof useI18n>['t']
type SubstatTargetsState = SubstatTargetTable

type TutorialSnapshot = {
  hsf: HsfFile | null
  recipes: BuilderRecipe[]
  sel: number | null
  metas: Metaset[]
  substatTargets: SubstatTargetsState
  fsr: FinalSellRemainderConfig
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  recipesEnabled: boolean
  note: string | null
  builder: BuilderRecipe
  // Filter/sort state is captured per-store (all modes) in viewStateSnapshotRef and restored
  // via restoreRulesFilterPreferencesSnapshot / restoreGearInspectorSubstatSortSnapshot.
  gearInspectorItems: GearInspectorItem[]
  previewMode: 'rules' | 'gearInspector'
  logicHubOpen: boolean
  logicHubDialogTab: LogicHubDialogTab
  // Gear Inspector display flags that the tutorial forces on and must restore afterward.
  safeguardImprovementChance: boolean
}

// Snapshot of view-only state that lives outside the main app snapshot (filter panels, sort).
type ViewStateSnapshot = {
  filterPrefs: RulesFilterPreferencesSnapshot
  sortState: GearInspectorSubstatSortState
  // Builder panel collapsed sections — reset to defaults on start, restored on close.
  builderCollapsed: BuilderCollapsedPreferencesSnapshot
}

// Blank builder state used to start a fresh tutorial session and as the base for the
// handleTutorialSkipTo replay pass. Single source of truth — do not duplicate inline.
const TUTORIAL_INITIAL_BUILDER: BuilderRecipe = {
  name: '',
  keep: true,
  exportMode: 'active',
  rankCode: RankCode.Any,
  rarityCode: RarityCode.Any,
  rarityMode: 'auto',
  factionCode: 0,
  mainStatsV: [],
  minLevel: LEVEL_MILESTONES[0]!,
  maxLevel: LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!,
  earlyKeepMode: 'early',
  substatsV: [],
  fixedSubstatsV: [],
  minCount: 1,
  autoMinCount: true,
  autoSubstatFlex: false,
  minRequiredRolls: 0,
  autoMinRequiredRolls: true,
}

const buildTutorialGearInspectorItems = (): GearInspectorItem[] => [
  {
    // Item 1: matches Recipe #3 (Banner, Refresh, SPD substat, ≥3 rolls, Late).
    // ACC main keeps it distinct from the RES-main safeguard item below.
    // SPD=20: recipes use rankCode=0 which defaults to 6-star conservative base=5;
    // 3-roll threshold = base*(1+3) = 5*4 = 20, so SPD must be ≥20 to match.
    itemId: 1,
    slot: ArtifactType.Banner,
    set: ArtifactSet.Refresh,
    rank: 5,
    rarity: RarityCode.Epic,
    level: LEVEL_MILESTONES[4]!,
    faction: Faction.BannerLords,
    main: StatVariant.ACC,
    subValues: {
      [StatVariant.SPD]: 20,
      [StatVariant.CR]: 8,
      [StatVariant.HP]: 5,
    },
    subOrder: [StatVariant.SPD, StatVariant.CR, StatVariant.HP],
    previewExtras: {
      source: 'manual',
      exactLevel: LEVEL_MILESTONES[4]!,
    },
  },
  {
    // Item 2: no recipe match → caught by Final Sell (accessories enabled).
    // Start compact so items 2–4 stay collapsed; only item 1 is expanded by default.
    itemId: 2,
    compact: true,
    slot: ArtifactType.Amulet,
    set: ACCESSORY_NO_SET_ID as ArtifactSet,
    rank: 4,
    rarity: RarityCode.Uncommon,
    level: LEVEL_MILESTONES[0]!,
    faction: Faction.KnightRevenant,
    main: StatVariant.CDMG,
    subValues: {
      [StatVariant.DEF_FLAT]: 9,
    },
    previewExtras: {
      source: 'manual',
      exactLevel: LEVEL_MILESTONES[0]!,
    },
  },
  {
    // Item 3: no SPD substat → fails Recipe #3 roll filter → Final Sell would sell it.
    // Rarity (Rare=3) matches safeguard rarities: [3,4,5] → Safeguard keeps it.
    itemId: 3,
    compact: true,
    slot: ArtifactType.Banner,
    set: ArtifactSet.Refresh,
    rank: 5,
    rarity: RarityCode.Rare,
    level: LEVEL_MILESTONES[2]!,
    faction: Faction.BannerLords,
    main: StatVariant.RES,
    subValues: {
      [StatVariant.HP]: 5,
      [StatVariant.DEF_FLAT]: 13,
      [StatVariant.ACC]: 6,
    },
    subOrder: [StatVariant.HP, StatVariant.DEF_FLAT, StatVariant.ACC],
    previewExtras: {
      source: 'manual',
      exactLevel: LEVEL_MILESTONES[2]!,
    },
  },
  {
    // Item 4: matches Recipe #2 (DPS Core Rolls — Boots, Slow DD metaset, HP% main,
    // SPD locked ≥1 roll, CR+CDMG required unlocked, 3 total rolls).
    // 6-star conservative base=5 for SPD/CR/CDMG; 1-roll threshold = base*2 = 10.
    // SPD=12≥10 (1 roll), CR=10≥10 (1 roll), CDMG=13≥10 (1 roll) → total 3 ✓.
    itemId: 4,
    compact: true,
    slot: ArtifactType.Boots,
    set: ArtifactSet.Lethal,
    rank: 5,
    rarity: RarityCode.Epic,
    level: LEVEL_MILESTONES[4]!,  // +16 max
    faction: Faction.BannerLords,
    main: StatVariant.HP,
    subValues: {
      [StatVariant.SPD]: 12,
      [StatVariant.CR]: 10,
      [StatVariant.CDMG]: 13,
      [StatVariant.ATK]: 5,
    },
    subOrder: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG, StatVariant.ATK],
    previewExtras: {
      source: 'manual',
      exactLevel: LEVEL_MILESTONES[4]!,
    },
  },
]

const buildTutorialSafeguardRules = (): SafeguardRule[] => [{
  name: 'Refresh RES Banner',
  combination: {
    slots: [ArtifactType.Banner],
    sets: [{ id: ArtifactSet.Refresh }],
    metaSetNames: [],
    // 5★ and 6★ only — low-rank pieces are not worth protecting.
    ranks: [5, 6],
    // Rare and higher — Common/Uncommon drops are not worth protecting.
    rarities: [3, 4, 5],
    mainStats: [StatVariant.RES],
    // No faction restriction — Refresh RES banners drop across multiple factions.
    factions: [],
  },
  requiredCount: 1,
  activation: SafeguardRuleActivation.ProtectExisting,
  // Tutorial snapshot mirrors the scope chip defaults by cloning the
  // sanitized count mode so demos highlight the same state as the UI.
  countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE },
  // Keep tutorial behavior aligned with current safeguard defaults.
  ignorePreviousSafeguards: SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
  ignoreEquippedInCollection: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
  ignoreEquippedInVault: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
  improvementChanceThreshold: SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD,
  // HP% and DEF% substats — at least one is sufficient (substatMatch: Min1).
  substats: [StatVariant.HP, StatVariant.DEF],
  substatMatch: SafeguardSubstatMatch.Min1,
  substatWeights: {},
}]

const cloneGearInspectorItem = (item: GearInspectorItem): GearInspectorItem => ({
  ...item,
  ...(item.subValues ? { subValues: { ...item.subValues } } : {}),
  ...(item.subOrder ? { subOrder: [...item.subOrder] } : {}),
  ...(item.previewExtras ? { previewExtras: { ...item.previewExtras } } : {}),
})

const cloneSafeguardRule = (rule: SafeguardRule): SafeguardRule => ({
  ...rule,
  combination: {
    slots: [...rule.combination.slots],
    sets: rule.combination.sets.map((entry) => (entry.excluded ? { id: entry.id, excluded: true } : { id: entry.id })),
    metaSetNames: [...(rule.combination.metaSetNames ?? [])],
    ranks: [...rule.combination.ranks],
    rarities: [...rule.combination.rarities],
    mainStats: [...rule.combination.mainStats],
    factions: [...rule.combination.factions],
  },
  activation: rule.activation,
  countMode: {
    perRule: rule.countMode.perRule,
    perSet: rule.countMode.perSet,
    perFaction: rule.countMode.perFaction,
    perMainStat: rule.countMode.perMainStat,
    perSlot: rule.countMode.perSlot,
  },
})

export type UseTutorialCoachStateParams = {
  hsf: HsfFile | null
  setHsf: Dispatch<SetStateAction<HsfFile | null>>
  customRecipes: BuilderRecipe[]
  setCustomRecipes: Dispatch<SetStateAction<BuilderRecipe[]>>
  selectedRecipeIdx: number | null
  setSelectedRecipeIdx: Dispatch<SetStateAction<number | null>>
  metasets: Metaset[]
  setMetasets: Dispatch<SetStateAction<Metaset[]>>
  substatTargets: SubstatTargetsState
  setSubstatTargets: Dispatch<SetStateAction<SubstatTargetsState>>
  finalSellRemainder: FinalSellRemainderConfig
  setFinalSellRemainder: Dispatch<SetStateAction<FinalSellRemainderConfig>>
  logicHubDialogTab: LogicHubDialogTab
  setLogicHubDialogTab: Dispatch<SetStateAction<LogicHubDialogTab>>
  safeguardRules: SafeguardRule[]
  setSafeguardRules: Dispatch<SetStateAction<SafeguardRule[]>>
  selectedSafeguardRuleIdx: number | null
  setSelectedSafeguardRuleIdx: Dispatch<SetStateAction<number | null>>
  setSafeguardBuilder: Dispatch<SetStateAction<SafeguardRule>>
  safeguardsEnabled: boolean
  setSafeguardsEnabled: Dispatch<SetStateAction<boolean>>
  recipesEnabled: boolean
  setRecipesEnabled: Dispatch<SetStateAction<boolean>>
  gearInspectorItems: GearInspectorItem[]
  setGearInspectorItems: Dispatch<SetStateAction<GearInspectorItem[]>>
  previewMode: 'rules' | 'gearInspector'
  setPreviewMode: Dispatch<SetStateAction<'rules' | 'gearInspector'>>
  sfcNote: string | null
  setSfcNote: Dispatch<SetStateAction<string | null>>
  builderRef: MutableRefObject<BuilderRecipe>
  setBuilder: Dispatch<SetStateAction<BuilderRecipe>>
  // Filter/sort state is managed via store-level snapshot/restore functions;
  // these params are no longer needed by the tutorial hook.
  logicHubOpen: boolean
  setLogicHubOpen: Dispatch<SetStateAction<boolean>>
  setBuilderMode: (mode: 'recipe' | 'safeguard') => void
  // Suppress history snapshots during tutorial-driven resets and restores.
  suppressHistorySnapshot: () => void
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
  sfcLoadNudgeActive: boolean
  sfcLoadNudgeFading: boolean
  triggerSfcLoadNudge: () => void
  clearSfcLoadNudge: () => void
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
  customRecipes,
  setCustomRecipes,
  selectedRecipeIdx,
  setSelectedRecipeIdx,
  metasets,
  setMetasets,
  substatTargets,
  setSubstatTargets,
  finalSellRemainder,
  setFinalSellRemainder,
  logicHubDialogTab,
  setLogicHubDialogTab,
  safeguardRules,
  setSafeguardRules,
  selectedSafeguardRuleIdx: _selectedSafeguardRuleIdx,
  setSelectedSafeguardRuleIdx,
  setSafeguardBuilder,
  safeguardsEnabled,
  setSafeguardsEnabled,
  recipesEnabled,
  setRecipesEnabled,
  gearInspectorItems,
  setGearInspectorItems,
  previewMode,
  setPreviewMode,
  sfcNote,
  setSfcNote,
  builderRef,
  setBuilder,
  logicHubOpen,
  setLogicHubOpen,
  setBuilderMode,
  suppressHistorySnapshot,
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
  const [, setTutorialAddedDefaultMetas] = useState<boolean>(false)

  // Timers/raf ids used by tutorial "helper actions" (open menus, scroll previews, etc.).
  // Why: tutorial steps can be aborted mid-flight and must always clean up scheduled work.
  const tutorialTimersRef = useRef<{ setsMenuRetryId: number | null; setsMenuCloseId: number | null; scrollAnimId: number | null }>({ setsMenuRetryId: null, setsMenuCloseId: null, scrollAnimId: null })

  const previewHighlightOverlayRef = useRef<HTMLDivElement | null>(null)
  const previewHighlightCleanupRef = useRef<(() => void) | null>(null)
  const previewHighlightRafRef = useRef<number | null>(null)

  const [tutorialSnapshot, setTutorialSnapshot] = useState<TutorialSnapshot | null>(null)

  const [sfcLoadNudgeActive, setSfcLoadNudgeActive] = useState(false)
  const [sfcLoadNudgeFading, setSfcLoadNudgeFading] = useState(false)
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nudgeFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hsfRef = useRef(hsf)
  useEffect(() => { hsfRef.current = hsf }, [hsf])
  const recipesRef = useRef(customRecipes)
  useEffect(() => { recipesRef.current = customRecipes }, [customRecipes])
  const selRef = useRef(selectedRecipeIdx)
  useEffect(() => { selRef.current = selectedRecipeIdx }, [selectedRecipeIdx])
  const metasRef = useRef(metasets)
  useEffect(() => { metasRef.current = metasets }, [metasets])
  const substatTargetsRef = useRef(substatTargets)
  useEffect(() => { substatTargetsRef.current = substatTargets }, [substatTargets])
  const fsrRef = useRef(finalSellRemainder)
  useEffect(() => { fsrRef.current = finalSellRemainder }, [finalSellRemainder])
  const safeguardRulesRef = useRef(safeguardRules)
  useEffect(() => { safeguardRulesRef.current = safeguardRules }, [safeguardRules])
  const safeguardsEnabledRef = useRef(safeguardsEnabled)
  useEffect(() => { safeguardsEnabledRef.current = safeguardsEnabled }, [safeguardsEnabled])
  const recipesEnabledRef = useRef(recipesEnabled)
  useEffect(() => { recipesEnabledRef.current = recipesEnabled }, [recipesEnabled])
  const noteRef = useRef(sfcNote)
  useEffect(() => { noteRef.current = sfcNote }, [sfcNote])
  // Filter/sort state is captured from stores directly; no per-render refs needed.
  const viewStateSnapshotRef = useRef<ViewStateSnapshot | null>(null)
  const gearInspectorItemsRef = useRef<GearInspectorItem[]>(gearInspectorItems)
  useEffect(() => { gearInspectorItemsRef.current = gearInspectorItems }, [gearInspectorItems])
  const gearInspectorPreviewModeRef = useRef<'rules' | 'gearInspector'>(previewMode)
  useEffect(() => { gearInspectorPreviewModeRef.current = previewMode }, [previewMode])
  const logicHubOpenRef = useRef<boolean>(logicHubOpen)
  useEffect(() => { logicHubOpenRef.current = logicHubOpen }, [logicHubOpen])
  const logicHubDialogTabRef = useRef<LogicHubDialogTab>(logicHubDialogTab)
  useEffect(() => { logicHubDialogTabRef.current = logicHubDialogTab }, [logicHubDialogTab])

  const clearPreviewHighlight = useCallback(() => {
    if (previewHighlightCleanupRef.current) {
      try { previewHighlightCleanupRef.current() } catch {}
      previewHighlightCleanupRef.current = null
    }
    if (previewHighlightRafRef.current !== null) {
      try { cancelAnimationFrame(previewHighlightRafRef.current) } catch {}
      previewHighlightRafRef.current = null
    }
    const overlay = previewHighlightOverlayRef.current
    if (overlay) {
      try { overlay.remove() } catch {}
      previewHighlightOverlayRef.current = null
    }
  }, [])

  const ensurePreviewHighlight = useCallback((mode: 'upper' | 'lower' | null) => {
    try {
      if (!mode) {
        clearPreviewHighlight()
        return
      }

      const container = document.querySelector('[data-tour-id="preview.table"]') as HTMLElement | null
      if (!container) {
        clearPreviewHighlight()
        return
      }

      clearPreviewHighlight()

      let overlay = previewHighlightOverlayRef.current
      if (!overlay) {
        overlay = document.createElement('div')
        overlay.dataset.tourId = mode === 'upper' ? 'preview.table.upper' : 'preview.table.lower'
        overlay.style.position = 'fixed'
        overlay.style.pointerEvents = 'none'
        overlay.style.background = 'transparent'
        overlay.style.opacity = '0'
        previewHighlightOverlayRef.current = overlay
        document.body.appendChild(overlay)
      } else if (!document.body.contains(overlay)) {
        document.body.appendChild(overlay)
      }

      const scheduleUpdate = () => {
        const update = () => {
          const targetOverlay = previewHighlightOverlayRef.current
          if (!targetOverlay || !container.isConnected) return
          try {
            const rect = container.getBoundingClientRect()
            targetOverlay.style.left = `${rect.left}px`
            targetOverlay.style.width = `${rect.width}px`
            const upperHeight = Math.max(0, Math.round(rect.height / 2))
            const lowerHeight = Math.max(0, rect.height - 96)
            const height = mode === 'upper' ? upperHeight : lowerHeight
            const top = mode === 'upper'
              ? rect.top
              : rect.top + rect.height - height
            targetOverlay.style.height = `${height}px`
            targetOverlay.style.top = `${top}px`
            targetOverlay.style.background = 'linear-gradient(to top, rgba(255,255,255,0.16), transparent)'
            targetOverlay.style.opacity = '1'
            targetOverlay.style.pointerEvents = 'none'
            targetOverlay.style.transition = 'opacity 160ms ease-in'
          } catch {}
        }
        update()
        previewHighlightRafRef.current = requestAnimationFrame(() => {
          previewHighlightRafRef.current = null
          update()
        })
      }

      const onResize = () => { scheduleUpdate() }
      const onScroll = () => { scheduleUpdate() }
      const onContainerScroll = () => { scheduleUpdate() }
      window.addEventListener('resize', onResize)
      window.addEventListener('scroll', onScroll, { capture: true, passive: true })
      container.addEventListener('scroll', onContainerScroll, { passive: true })
      previewHighlightCleanupRef.current = () => {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('scroll', onScroll, true as unknown as undefined)
        container.removeEventListener('scroll', onContainerScroll)
        if (previewHighlightRafRef.current !== null) {
          try { cancelAnimationFrame(previewHighlightRafRef.current) } catch {}
          previewHighlightRafRef.current = null
        }
      }
      scheduleUpdate()
      setTimeout(scheduleUpdate, 60)
    } catch {
      clearPreviewHighlight()
    }
  }, [clearPreviewHighlight])

  useEffect(() => () => { ensurePreviewHighlight(null) }, [ensurePreviewHighlight])

  const closeAllTransientUi = useCallback(() => {
    try {
      const pressEsc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      pressEsc(); setTimeout(pressEsc, 40)
    } catch {}
    try { ensurePreviewHighlight(null) } catch {}
    try {
      setLogicHubOpen(false)
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
      // Cancel any in-progress tutorial-driven scroll animation.
      // Why: leaving an animation running after the tutorial closes would keep moving the preview unexpectedly.
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
  }, [ensurePreviewHighlight, setLogicHubOpen])

  const restoreFromTutorialSnapshot = useCallback(() => {
    const snap = tutorialSnapshot
    if (!snap) return
    try {
      // Suppress history so tutorial restores do not create undo/redo entries.
      suppressHistorySnapshot()
      // Restore filter/sort and display flags first (outside React batching) so panels paint correctly.
      const viewSnap = viewStateSnapshotRef.current
      if (viewSnap) {
        restoreRulesFilterPreferencesSnapshot(viewSnap.filterPrefs)
        restoreGearInspectorSubstatSortSnapshot(viewSnap.sortState)
        restoreBuilderCollapsedPreferencesSnapshot(viewSnap.builderCollapsed)
        viewStateSnapshotRef.current = null
      }
      restoreSafeguardImprovementChance(snap.safeguardImprovementChance)
      // eslint-disable-next-line @eslint-react/dom/no-flush-sync -- Tutorial restore must synchronously commit all state setters so the DOM reflects the restored snapshot before the next coach step measures element positions.
      flushSync(() => {
        setHsf(snap.hsf)
        setCustomRecipes(snap.recipes)
        setSelectedRecipeIdx(snap.sel)
        setMetasets(snap.metas)
        setSubstatTargets(snap.substatTargets)
        setFinalSellRemainder(snap.fsr)
        setSafeguardRules(snap.safeguardRules)
        setSelectedSafeguardRuleIdx(null)
        setSafeguardsEnabled(snap.safeguardsEnabled)
        setRecipesEnabled(snap.recipesEnabled)
        setSfcNote(snap.note)
        setBuilder(snap.builder)
        setGearInspectorItems(snap.gearInspectorItems)
        setPreviewMode(snap.previewMode)
        setLogicHubOpen(snap.logicHubOpen)
        setLogicHubDialogTab(snap.logicHubDialogTab)
      })
    } catch {}
  }, [
    setBuilder,
    setCustomRecipes,
    setFinalSellRemainder,
    setHsf,
    setSfcNote,
    setMetasets,
    setSubstatTargets,
    setSelectedRecipeIdx,
    setSafeguardRules,
    setSelectedSafeguardRuleIdx,
    setSafeguardsEnabled,
    setRecipesEnabled,
    setGearInspectorItems,
    setPreviewMode,
    setLogicHubOpen,
    setLogicHubDialogTab,
    suppressHistorySnapshot,
    tutorialSnapshot,
  ])

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

    const ensureFinalSellGearTab = (open: boolean) => {
      try {
        // Always pivot to the Gear tab before toggling visibility so overlays never land on stale sections.
        setLogicHubDialogTab(LOGIC_HUB_DIALOG_TAB_GEAR)
        setLogicHubOpen(open)
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

    const ensureLogicHubDialog = (open: boolean) => {
      try { setLogicHubOpen(open) } catch {}
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
        // Start from the top so the animation is deterministic regardless of prior scroll position.
        try { container.scrollTop = 0 } catch {}
        // Keep this short and bounded; it's a guided demo, not a "smooth page scroll".
        const DURATION_MS = 2400
        const startAt = performance.now()
        const easeInOut = (time: number) => (time < 0.5 ? 2 * time * time : -1 + (4 - 2 * time) * time)
        const timers = tutorialTimersRef.current
        const step = (now: number) => {
          const p = Math.min(1, (now - startAt) / DURATION_MS)
          const eased = easeInOut(p)
          // Re-read scrollHeight every frame so rows added asynchronously by WASM (e.g. flex
          // permutations, a new recipe) are included and the animation always converges on the
          // true bottom rather than an early snapshot that undershoots.
          const currentEnd = Math.max(0, container.scrollHeight - container.clientHeight)
          try { container.scrollTop = Math.round(currentEnd * eased) } catch {}
          if (p < 1) { timers.scrollAnimId = requestAnimationFrame(step) } else { timers.scrollAnimId = null }
        }
        if (timers.scrollAnimId !== null) { try { cancelAnimationFrame(timers.scrollAnimId) } catch {} ; timers.scrollAnimId = null }
        timers.scrollAnimId = requestAnimationFrame(step)
      } catch {}
    }

    try {
      const cloneHsf = hsfRef.current ? (JSON.parse(JSON.stringify(hsfRef.current)) as HsfFile) : null
      const srcRecipes = recipesRef.current
      const srcMetas = metasRef.current
      const srcSubstatTargets = substatTargetsRef.current
      const srcFsr = fsrRef.current
      const srcBuilder = builderRef.current
      const cloneRecipes = srcRecipes.map((recipe) => cloneBuilderRecipe(recipe)) // ensure tutorial snapshots stay isolated
      const cloneMetas = srcMetas.map((meta) => ({ ...meta, sets: meta.sets.slice() }))
      const clonedSubstatTargets = JSON.parse(JSON.stringify(srcSubstatTargets)) as SubstatTargetsState
      const cloneFsr = JSON.parse(JSON.stringify(srcFsr)) as FinalSellRemainderConfig
      const cloneBuilder = JSON.parse(JSON.stringify(srcBuilder)) as BuilderRecipe
      // Snapshot filter/sort and builder-collapsed state across all modes before we wipe them.
      viewStateSnapshotRef.current = {
        filterPrefs: snapshotRulesFilterPreferences(),
        sortState: snapshotGearInspectorSubstatSort(),
        builderCollapsed: snapshotBuilderCollapsedPreferences(),
      }
      setTutorialSnapshot({
        hsf: cloneHsf,
        recipes: cloneRecipes,
        sel: selRef.current,
        metas: cloneMetas,
        substatTargets: clonedSubstatTargets,
        fsr: cloneFsr,
        safeguardRules: safeguardRulesRef.current?.map((rule) => cloneSafeguardRule(rule)) ?? [],
        safeguardsEnabled: safeguardsEnabledRef.current,
        recipesEnabled: recipesEnabledRef.current,
        note: noteRef.current,
        builder: cloneBuilder,
        gearInspectorItems: gearInspectorItemsRef.current.map((item) => cloneGearInspectorItem(item)),
        previewMode: gearInspectorPreviewModeRef.current,
        logicHubOpen: logicHubOpenRef.current,
        logicHubDialogTab: logicHubDialogTabRef.current,
        safeguardImprovementChance: snapshotSafeguardImprovementChance(),
      })
    } catch {}

    try {
      // Suppress history so the tutorial reset doesn't pollute undo/redo stacks.
      suppressHistorySnapshot()
      setHsf(null)
      setCustomRecipes([])
      setSelectedRecipeIdx(null)
      setMetasets([])
      setSubstatTargets(defaultSubstatTargets())
      setFinalSellRemainder({ artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[], setsMode: FINAL_SELL_DEFAULT_SETS_MODE })
      setLogicHubDialogTab(LOGIC_HUB_DIALOG_TAB_FINAL_SELL)
      setSfcNote(null)
      setBuilder(TUTORIAL_INITIAL_BUILDER)
      // Reset all-modes filter/sort and builder-collapsed state so the tutorial starts clean.
      resetRulesFilterPreferences()
      clearGearInspectorSubstatSortStandalone()
      resetBuilderCollapsedPreferences()
      setGearInspectorItems([])
      setLogicHubOpen(false)
      setPreviewMode('rules')
      // Always start in Recipe Builder mode so the first steps target the right panel.
      setBuilderMode('recipe')
      setSafeguardRules([])
      setSelectedSafeguardRuleIdx(null)
      // Reset to app defaults: both toggles on, no safeguard rules to interfere.
      setSafeguardsEnabled(true)
      setRecipesEnabled(true)
      // Ensure improvement chance column is visible for the safeguards payoff step.
      restoreSafeguardImprovementChance(true)
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
        targetId: 'builder.core',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureLogicHubDialog(false) },
      },
      {
        id: 'action',
        title: t('tutActionTitle'),
        body: t('tutActionBody'),
        targetIds: ['builder.action.keep', 'builder.action.sell'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureLogicHubDialog(false) },
      },
      {
        id: 'basics',
        title: t('tutBasicsTitle'),
        body: t('tutBasicsBody'),
        targetIds: ['builder.rank', 'builder.rarity', 'builder.faction', 'builder.level-window'],
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
          setBuilder((prev) => ({ ...prev, artifactSets: [{ id: ArtifactSet.Speed }] }))
        },
      },
      {
        id: 'add',
        title: t('tutAddRecipeTitle'),
        body: t('tutAddRecipeBody'),
        targetId: 'builder.add-recipe',
      },
      {
        id: 'added',
        title: t('tutRecipeAddedTitle'),
        body: t('tutRecipeAddedBody'),
        targetIds: ['chip.selected', 'builder.add-recipe'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'preview-locate',
        title: t('tutSeeRulesTitle'),
        body: t('tutSeeRulesBody'),
        targetId: 'preview.table.upper',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight('upper') },
      },
    ]

    const advanced: TutorialStep[] = [
      {
        // Explain metasets before the advanced recipe so the concept is available when
        // Recipe #2 needs Slow DD later. Context: Recipe #1 (Speed Boots) is already committed.
        id: 'metasets-open',
        title: t('tutMetasetsManageTitle'),
        body: t('tutMetasetsManageBody'),
        targetId: 'builder.manage-metasets',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        // Show the dialog with Speed-Sets + Slow DD + defaults pre-created; highlight the first row.
        id: 'metasets-add',
        title: t('tutMetasetsAddTitle'),
        body: t('tutMetasetsAddBody'),
        targetId: 'metasets.row.first',
        before: () => {
          ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false)
          // Pre-create Speed, Slow DD, and the three default metasets so the dialog shows
          // a realistic populated list. All creates are idempotent (no-op if already present).
          setMetasets((prev) => {
            let next = prev
            if (!next.some((m) => m.name.trim().toLowerCase() === 'speed-sets'))
              next = next.concat({ name: 'Speed-Sets', sets: [ArtifactSet.Speed, ArtifactSet.Perception, ArtifactSet.Protection], show: true, iconId: DEFAULT_METASET_ICON_ID })
            if (!next.some((m) => m.name.trim().toLowerCase() === 'slow dd'))
              next = next.concat({ name: 'Slow DD', sets: [ArtifactSet.Lethal, ArtifactSet.Savage, ArtifactSet.Stoneskin], show: true, iconId: DEFAULT_METASET_ICON_ID })
            const wanted = new Set(['Nuker', 'Debuffer', 'Survivability'])
            const defs = defaultMetasets().filter((meta) => wanted.has(meta.name))
            const have = new Set(next.map((m) => m.name))
            const add = defs.filter((meta) => !have.has(meta.name))
            return add.length ? next.concat(add) : next
          })
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
        // Open Sets menu with Speed-Sets already selected — the user can see it highlighted in the
        // dropdown. The menu stays open; step 14 then closes it and points at Apply.
        id: 'sets-metasets-basic',
        title: t('tutMetasetsApplyBasicTitle'),
        body: t('tutMetasetsApplyBasicBody'),
        targetId: 'menu.metasets.section',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(true); ensureChipsMenu(false)
          // Set builder to Speed-Sets so the dropdown renders it as selected (dirty state).
          // The committed recipe keeps no metaset yet — Apply is enabled because builder ≠ recipe.
          // Use metasRef.current (not the closure-captured `metasets`) to get the live state
          // — metasets-add adds Speed-Sets after startTutorial's callback was memoized.
          const speed = metasRef.current.find((m) => m.name.trim().toLowerCase() === 'speed-sets')
          if (speed) {
            suppressHistorySnapshot()
            setBuilder((prev) => ({ ...prev, artifactMetaSets: [speed.name], artifactSets: [] }))
          }
          setSelectedRecipeIdx(0)
          const timers = tutorialTimersRef.current
          if (timers.setsMenuRetryId !== null) { try { clearTimeout(timers.setsMenuRetryId) } catch {} ; timers.setsMenuRetryId = null }
          timers.setsMenuRetryId = window.setTimeout(() => { try { ensureSetsMenu(true) } catch {} }, 60)
        },
      },
      {
        // Dropdown is closed; Apply button is highlighted. Builder still has Speed-Sets (dirty)
        // so Apply is enabled. handleTutorialNext commits it when the user presses Next.
        id: 'sets-metasets-apply',
        title: t('tutMetasetsApplyConfirmTitle'),
        body: t('tutMetasetsApplyConfirmBody'),
        targetId: 'builder.apply-recipe',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false)
          // Keep builder at Speed-Sets (dirty) so Apply button remains enabled.
          // Do not commit to the recipe here — that happens in handleTutorialNext.
          const speed = metasRef.current.find((m) => m.name.trim().toLowerCase() === 'speed-sets')
          if (speed) {
            suppressHistorySnapshot()
            setBuilder((prev) => ({ ...prev, artifactMetaSets: [speed.name], artifactSets: [] }))
          }
          setSelectedRecipeIdx(0)
        },
      },
      {
        // Show the preview with the Speed-Sets metaset applied to Recipe #1.
        // Highlight only the top third of the preview table (Recipe #1's rows are at the top).
        id: 'metasets-preview-basic',
        title: t('tutMetasetsPreviewBasicTitle'),
        body: t('tutMetasetsPreviewBasicBody'),
        targetId: 'preview.table-top',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          // Commit Speed-Sets to Recipe #1 so the preview reflects the applied metaset.
          // (Natural flow: handleTutorialNext on sets-metasets-apply already did this.
          //  Replay/back-nav: before() ensures the state is correct regardless of path.)
          const speed = metasRef.current.find((m) => m.name.trim().toLowerCase() === 'speed-sets')
          if (speed) {
            suppressHistorySnapshot()
            setBuilder((prev) => ({ ...prev, artifactMetaSets: [speed.name], artifactSets: [] }))
            setCustomRecipes((prev) => prev.map((r, i) => i === 0 ? { ...r, artifactMetaSets: [speed.name], artifactSets: [] } : r))
          }
          setSelectedRecipeIdx(0)
        },
      },
      {
        id: 'adv-intro',
        title: t('tutAdvIntroTitle'),
        body: t('tutAdvIntroBody'),
        targetId: 'builder.core',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null) },
      },
      {
        id: 'name',
        title: t('tutAdvNameTitle'),
        body: t('tutAdvNameBody'),
        targetId: 'builder.name',
        before: () => setBuilder((prev) => ({ ...prev, name: 'DPS Core Rolls' })),
      },
      {
        id: 'adv-select-slots-main',
        title: t('tutAdvSelectSlotsMainTitle'),
        body: t('tutAdvSelectSlotsMainBody'),
        targetIds: ['builder.slots', 'builder.mainstat'],
        // Two mains only (HP% + ATK%) — DEF% is mentioned in the body text but omitted to keep the demo tight.
        before: () => setBuilder((prev) => ({
          ...prev,
          artifactTypes: [ArtifactType.Chestplate, ArtifactType.Boots],
          mainStatsV: [StatVariant.HP, StatVariant.ATK],
        })),
      },
      {
        id: 'subs',
        title: t('tutAdvChooseSubstatsTitle'),
        body: t('tutAdvChooseSubstatsBody'),
        targetId: 'builder.substats',
        // Lock only SPD — CR and CDMG are required but unlocked (no per-stat roll floor).
        // Pre-set Required=2 so the "required equals locked" warning does not fire (2 ≠ 1 locked).
        // Flex stays OFF here; it is explained and enabled in the dedicated Flex section later.
        before: () => setBuilder((prev) => ({
          ...prev,
          substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
          fixedSubstatsV: [StatVariant.SPD],
          autoMinCount: false,
          minCount: 2,
          autoSubstatFlex: false,
        })),
      },
      {
        id: 'required',
        title: t('tutAdvRequiredTitle'),
        body: t('tutAdvRequiredBody'),
        targetIds: ['builder.required.label', 'builder.required'],
        // Required = 2: SPD (locked) always fills one slot; CR or CDMG fills the other.
        // Flex remains OFF — the Flex section after adv-add explains and enables it.
        before: () => setBuilder((prev) => ({ ...prev, autoMinCount: false, minCount: 2 })),
      },
      {
        id: 'min-rolls',
        title: t('tutAdvMinRollsTitle'),
        body: t('tutAdvMinRollsBody'),
        // Remove stale builder.min-rolls.toggle (no such element in the DOM).
        targetIds: ['builder.min-rolls.label', 'builder.min-rolls'],
        before: () => setBuilder((prev) => ({ ...prev, autoMinRequiredRolls: false, minRequiredRolls: 3 })),
      },
      {
        // Introduces lockedMinRequiredRolls. Highlights both the number 2 button and its lock icon
        // so it is obvious where to click — the lock icon alone is too small to spot easily.
        id: 'locked-min-rolls',
        title: t('tutLockedMinRollsTitle'),
        body: t('tutLockedMinRollsBody'),
        targetIds: ['builder.min-rolls.button.1', 'builder.min-rolls.lock-icon.1'],
        before: () => setBuilder((prev) => ({ ...prev, lockedMinRequiredRolls: 1 })),
      },
      {
        id: 'sets-metasets',
        title: t('tutMetasetsInSetsTitle'),
        body: t('tutMetasetsInSetsBody'),
        targetId: 'menu.metasets.section',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(true); ensureChipsMenu(false)
          // Pre-select Slow DD in the builder so the dropdown renders it as selected.
          // The recipe is not committed yet (dirty state); handleTutorialNext applies it on Next.
          const slow = metasRef.current.find((m) => m.name.trim().toLowerCase() === 'slow dd')
          if (slow) {
            suppressHistorySnapshot()
            setBuilder((prev) => ({ ...prev, artifactMetaSets: [slow.name], artifactSets: [] }))
          }
          setSelectedRecipeIdx(1)
          const timers = tutorialTimersRef.current
          if (timers.setsMenuRetryId !== null) { try { clearTimeout(timers.setsMenuRetryId) } catch {} ; timers.setsMenuRetryId = null }
          timers.setsMenuRetryId = window.setTimeout(() => { try { ensureSetsMenu(true) } catch {} }, 60)
        },
      },
      {
        id: 'adv-add',
        title: t('tutAdvAddTitle'),
        body: t('tutAdvAddBody'),
        targetId: 'builder.add-recipe',
      },
      {
        // Preview the committed recipe WITHOUT Flex so users see the strict baseline:
        // all three substats must be present on every matched piece.
        id: 'flex-no-flex',
        title: t('tutFlexNoFlexTitle'),
        body: t('tutFlexNoFlexBody'),
        targetId: 'preview.table',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          // Confirm Recipe #2 is committed with flex=false and keep it selected for preview highlighting.
          setCustomRecipes((prev) => prev.map((r, i) => i === 1 ? { ...r, autoSubstatFlex: false } : r))
          setSelectedRecipeIdx(1)
          setTimeout(() => { try { smoothScrollPreviewToEnd() } catch {} }, 120)
        },
      },
      {
        // Merged flex-toggle + flex-apply: Flex chip is on in the builder but Recipe #2 still
        // has flex=false — the preview keeps strict rows. Pressing Next commits flex (via
        // flex-preview's before()), so Back/Next lets users compare before and after.
        id: 'flex-toggle',
        title: t('tutFlexToggleTitle'),
        body: t('tutFlexToggleBody'),
        targetId: 'builder.flex-chip',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          // Flex ON in the builder (chip shows as active) but Recipe #2 still has flex=false
          // so the preview keeps strict rows — the contrast is visible when toggling Back/Next.
          setBuilder((prev) => ({ ...prev, autoSubstatFlex: true }))
          setCustomRecipes((prev) => prev.map((r, i) => i === 1 ? { ...r, autoSubstatFlex: false } : r))
          setSelectedRecipeIdx(1)
        },
      },
      {
        // Show the expanded preview after flex is committed. Flex is committed here (not in
        // flex-toggle) so that Back → flex-toggle restores strict rows and Next re-expands them.
        id: 'flex-preview',
        title: t('tutAdvPreviewEarlyTitle'),
        body: t('tutAdvPreviewEarlyBody'),
        targetId: 'preview.table',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          // Commit flex=true to Recipe #2 — preview expands to one row per flex combination.
          setCustomRecipes((prev) => prev.map((r, i) => i === 1 ? { ...r, autoSubstatFlex: true } : r))
          setSelectedRecipeIdx(1)
          setTimeout(() => { try { smoothScrollPreviewToEnd() } catch {} }, 120)
        },
      },
      {
        // Spotlights the slot picker. Min Rolls starts at Auto here; the substats step sets it to 3.
        id: 'auto-late-slot',
        title: t('tutAutoLateSlotTitle'),
        body: t('tutAutoLateSlotBody'),
        targetId: 'builder.slots',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          setBuilder((prev) => ({
            ...prev,
            name: 'Banner SPD — Late 3 rolls',
            artifactTypes: [ArtifactType.Banner],
            artifactSets: [],
            artifactMetaSets: [],
            mainStatsV: [],
            substatsV: [StatVariant.SPD],
            fixedSubstatsV: [],
            autoMinCount: true,
            minCount: 1, // explicit sync — setBuilder bypasses normalizeKeepWithAuto
            autoSubstatFlex: false,
            autoMinRequiredRolls: true,
            rarityCode: 0,
            rarityMode: 'auto',
            earlyKeepMode: 'early',
            autoRaritySupplementsThreshold: 'rare',
          }))
        },
      },
      {
        // Spotlights substats and sets Min Rolls to 3 — since SPD is the only stat, this means 3 SPD rolls.
        id: 'auto-late-substats',
        title: t('tutAutoLateSubstatsTitle'),
        body: t('tutAutoLateSubstatsBody'),
        targetId: 'builder.substats',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          // Per-stat roll minimum of 3 for SPD via substatRollBoundsV — shows the green badge on the chip.
          setBuilder((prev) => ({ ...prev, substatRollBoundsV: { [StatVariant.SPD]: { min: 3 } } }))
        },
      },
      {
        id: 'auto-late-mode',
        title: t('tutAutoLateModeTitle'),
        body: t('tutAutoLateModeBody'),
        targetIds: ['builder.thresholds.label', 'builder.thresholds', 'builder.thresholds.auto-chip'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          // Switch builder to Late mode — this step explains the Late/Early tradeoff and shows the button active.
          setBuilder((prev) => ({ ...prev, earlyKeepMode: 'late' }))
        },
      },
      {
        id: 'auto-late-chip',
        title: t('tutAutoLateChipTitle'),
        body: t('tutAutoLateChipBody'),
        targetIds: ['builder.thresholds.auto-chip'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null) },
      },
      {
        id: 'auto-late-add',
        title: t('tutAutoLateAddTitle'),
        body: t('tutAutoLateAddBody'),
        targetId: 'builder.add-recipe',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'preview-highlight',
        title: t('tutPreviewHighlightTitle'),
        body: t('tutPreviewHighlightBody'),
        targetId: 'preview.table.lower',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHeaderMenu(false)
          // Select Recipe #3 (index 2) explicitly — the handleTutorialNext selection may not be
          // committed before this before() fires, leaving Recipe #2 highlighted instead.
          // Also restore Late mode in case we're stepping back from preview-highlight-early.
          setCustomRecipes(prev => prev.map((r, i) => i === 2 && r.earlyKeepMode !== 'late' ? { ...r, earlyKeepMode: 'late' as const } : r))
          setSelectedRecipeIdx(2)
          // The table is TanStack-virtualized — Recipe #3 rows are not in the DOM until the
          // container is scrolled near them. Poll on scrollHeight growth instead: once the
          // virtualizer extends its total height for the new recipe's rules, snap to the bottom.
          const baseContainer = document.querySelector('[data-tour-id="preview.table"]') as HTMLElement | null
          const baseHeight = baseContainer?.scrollHeight ?? 0
          let attempts = 0
          const snapToRecipe3 = () => {
            try {
              const el = document.querySelector('[data-tour-id="preview.table"]') as HTMLElement | null
              // Fire when new rows are reflected in virtual height, or fall back after ~3 s.
              if (el && (el.scrollHeight > baseHeight + 50 || attempts >= 18)) {
                el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
                try { ensurePreviewHighlight('lower') } catch {}
                return
              }
            } catch {}
            if (attempts < 20) { attempts++; setTimeout(snapToRecipe3, 150) }
          }
          setTimeout(snapToRecipe3, 80)
        },
      },
      {
        id: 'preview-highlight-early',
        title: t('tutPreviewHighlightEarlyTitle'),
        body: t('tutPreviewHighlightEarlyBody'),
        targetId: 'preview.table.lower',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHeaderMenu(false)
          // Swap Recipe #3 to Early mode so the user can compare against the Late version on Back.
          setCustomRecipes(prev => prev.map((r, i) => i === 2 && r.earlyKeepMode !== 'early' ? { ...r, earlyKeepMode: 'early' as const } : r))
          setSelectedRecipeIdx(2)
          // Same approach as preview-highlight — earlyKeepMode change retriggers the worker.
          // Capture height before the state change propagates; snap once virtual height updates.
          const baseContainerE = document.querySelector('[data-tour-id="preview.table"]') as HTMLElement | null
          const baseHeightE = baseContainerE?.scrollHeight ?? 0
          let attemptsE = 0
          const snapToRecipe3E = () => {
            try {
              const el = document.querySelector('[data-tour-id="preview.table"]') as HTMLElement | null
              if (el && (el.scrollHeight !== baseHeightE || attemptsE >= 10)) {
                el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
                try { ensurePreviewHighlight('lower') } catch {}
                return
              }
            } catch {}
            if (attemptsE < 20) { attemptsE++; setTimeout(snapToRecipe3E, 150) }
          }
          setTimeout(snapToRecipe3E, 80)
        },
      },
      {
        id: 'gear-inspector-open',
        title: t('tutGearDialogOpenTitle'),
        body: t('tutGearDialogOpenBody'),
        targetId: 'builder.tools-button',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureLogicHubDialog(false); ensurePreviewHighlight(null)
          setPreviewMode('rules')
          ensureFinalSellGearTab(false)
        },
      },
      {
        id: 'gear-inspector-add-manual',
        title: t('tutGearDialogAddTitle'),
        body: t('tutGearDialogAddBody'),
        // Union the dialog container with the Add button so both are spotlit together.
        targetIds: ['gear-inspector.dialog', 'gear-inspector.add-manual'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureLogicHubDialog(false); ensurePreviewHighlight(null)
          setPreviewMode('rules')
          ensureFinalSellGearTab(true)
          setGearInspectorItems(buildTutorialGearInspectorItems())
        },
      },
      {
        id: 'gear-inspector-preview',
        title: t('tutGearDialogPreviewTitle'),
        body: t('tutGearDialogPreviewBody'),
        // Highlight the upper 75 % of the paper — covers the mode toggle + visible gear grid rows.
        targetId: 'preview.paper-top',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureLogicHubDialog(false); ensurePreviewHighlight(null)
          // Close the integrated Gear tab before flipping the preview so the overlay only tracks the table.
          ensureFinalSellGearTab(false)
          setPreviewMode('gearInspector')
        },
      },
      {
        id: 'finalsell-intro',
        title: t('tutFinalSellIntroTitle'),
        body: t('tutFinalSellIntroBody'),
        targetId: 'finalsell.toggle',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureLogicHubDialog(false); ensurePreviewHeaderMenu(false); ensurePreviewHighlight(null)
          // Reset Final Sell to disabled so stepping back from finalsell-dialog undoes its before-hook.
          setFinalSellRemainder({ artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[], setsMode: FINAL_SELL_DEFAULT_SETS_MODE })
        },
      },
      {
        id: 'finalsell-dialog',
        title: t('tutLogicHubDialogTitle'),
        body: t('tutLogicHubDialogBody'),
        targetIds: ['finalsell.dialog.sets', 'finalsell.dialog.warning', 'finalsell.dialog.types', 'finalsell.dialog.levels', 'finalsell.dialog.status'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          setLogicHubDialogTab(LOGIC_HUB_DIALOG_TAB_FINAL_SELL)
          try {
            setLogicHubOpen(true)
            setFinalSellRemainder((prev) => {
              const safePrev = prev ?? { artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[], setsMode: FINAL_SELL_DEFAULT_SETS_MODE }
              const levels = safePrev.levels?.length ? safePrev.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[])
              return { ...safePrev, artifacts: true, accessories: true, levels }
            })
          } catch {}
        },
      },
      {
        id: 'finalsell-preview',
        title: t('tutFinalSellPreviewTitle'),
        body: t('tutFinalSellPreviewBody'),
        // Show the upper 75 % of the paper — covers the mode toggle + visible gear grid rows.
        targetId: 'preview.paper-top',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          setLogicHubOpen(false)
          // Switch to Gear Inspector so the Final Sell outcomes are visible alongside the items.
          setPreviewMode('gearInspector')
          if (!gearInspectorItemsRef.current.length) setGearInspectorItems(buildTutorialGearInspectorItems())
        },
      },
      {
        id: 'safeguards-intro',
        title: t('tutSafeguardsIntroTitle'),
        body: t('tutSafeguardsIntroBody'),
        // Highlight the builder core (contains the mode toggle) and the safeguard builder form.
        // 'safeguards.tab' no longer exists — Safeguards is now a builder mode toggle, not a dialog tab.
        targetIds: ['builder.core', 'safeguards.builder'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          setLogicHubOpen(false)
          // Switch to Safeguard Builder mode — no rule added yet; the form starts blank.
          setBuilderMode('safeguard')
          setSafeguardRules([])
          setSelectedSafeguardRuleIdx(null)
          setSafeguardsEnabled(true)
        },
      },
      {
        id: 'safeguards-rule',
        title: t('tutSafeguardsRuleTitle'),
        body: t('tutSafeguardsRuleBody'),
        // Target the single tutorial chip + builder form — avoids highlighting the empty chips area.
        targetIds: ['safeguards.chip.tutorial-refresh-safeguard', 'safeguards.builder'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          setLogicHubOpen(false)
          setBuilderMode('safeguard')
          const rules = buildTutorialSafeguardRules()
          setSafeguardRules(rules)
          setSafeguardsEnabled(true)
          // Mirror handleSelectSafeguardRule: set selection AND load the rule into the builder
          // so the form controls reflect its values, exactly as a manual chip click would.
          const rule = rules[0]
          // Select by index (0 = first/only rule); mirrors handleSelectSafeguardRule.
          if (rule) { setSelectedSafeguardRuleIdx(0); setSafeguardBuilder(cloneSafeguardRule(rule)) }
        },
      },
      {
        // Payoff step: flip to Gear Inspector so users see all four outcomes at once.
        // Why: the four sample items demonstrate recipe keep (×2) / Final Sell sell / Safeguard keep
        // in one view — this step makes the full pipeline visible.
        id: 'safeguards-payoff',
        title: t('tutSafeguardsPayoffTitle'),
        body: t('tutSafeguardsPayoffBody'),
        targetId: 'preview.paper-top',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHighlight(null)
          setLogicHubOpen(false)
          setBuilderMode('safeguard')
          setSafeguardRules(buildTutorialSafeguardRules())
          setSafeguardsEnabled(true)
          setGearInspectorItems(buildTutorialGearInspectorItems())
          setPreviewMode('gearInspector')
        },
      },
      {
        id: 'note',
        title: t('tutNoteTitle'),
        body: t('tutNoteBody'),
        targetId: 'note.toggle',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureLogicHubDialog(false); ensurePreviewHighlight(null)
          try { setLogicHubOpen(false) } catch {}
        },
      },
      {
        // Merged: was save-explain + preview + export-explain.
        // Resets preview to rules mode (was the 'preview' step's job) before pointing at export.
        id: 'export-explain',
        title: t('tutExportExplainTitle'),
        body: t('tutExportExplainBody'),
        targetIds: ['hsf.export', 'sfc.save'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHeaderMenu(false); ensurePreviewHighlight(null)
          setPreviewMode('rules')
          try { setLogicHubOpen(false) } catch {}
        },
      },
    ]

    const steps = [...basic, ...advanced]
    setTutorialSteps(steps)
    const find = (id: string) => steps.findIndex((step) => step.id === id)
    const sections: Array<{ label: string; index: number }> = [
      { label: t('tutSectionBasicsLabel'), index: find('welcome') },
      // Metasets comes before Advanced — concept is introduced while Recipe #1 is selected.
      { label: t('tutSectionMetasetsLabel'), index: find('metasets-open') },
      { label: t('tutSectionAdvancedLabel'), index: find('adv-intro') },
      // Flex: toggle + apply + preview — adding Recipe #2 and the no-flex baseline belong to Advanced.
      { label: t('tutSectionFlexLabel'), index: find('flex-toggle') },
      { label: t('tutSectionAutoLateLabel'), index: find('auto-late-slot') },
      { label: t('tutSectionGearInspectorLabel'), index: find('gear-inspector-open') },
      { label: t('tutSectionFinalSellLabel'), index: find('finalsell-intro') },
      { label: t('tutSectionSafeguardsLabel'), index: find('safeguards-intro') },
      { label: t('tutSectionSaveExportLabel'), index: find('note') },
    ].filter((section) => section.index >= 0)
    setTutorialSections(sections)
    setTutorialOpen(true)
  }, [
    builderRef,
    ensurePreviewHighlight,
    setBuilder,
    setCustomRecipes,
    setLogicHubOpen,
    setFinalSellRemainder,
    setSfcNote,
    setHsf,
    setMetasets,
    setSubstatTargets,
    setSelectedRecipeIdx,
    setGearInspectorItems,
    setPreviewMode,
    setLogicHubDialogTab,
    setSafeguardBuilder,
    setSafeguardRules,
    setSafeguardsEnabled,
    setRecipesEnabled,
    setSelectedSafeguardRuleIdx,
    setTutorialAddedAutoLate,
    setTutorialAddedAdvanced,
    setTutorialAddedBasic,
    setTutorialAddedDefaultMetas,
    setTutorialAddedSlowDD,
    setTutorialIdx,
    setTutorialOpen,
    setTutorialSections,
    setBuilderMode,
    setTutorialSnapshot,
    setTutorialSteps,
    suppressHistorySnapshot,
    t,
  ])

  const handleTutorialSkipTo = useCallback((idx: number) => {
    try {
      closeAllTransientUi()
      const steps = tutorialSteps
      let nextHsf: HsfFile | null = null
      let nextRecipes: BuilderRecipe[] = []
      let nextSel: number | null = null
      let nextMetas: Metaset[] = []
      let nextSubstatTargets = defaultSubstatTargets()
      let nextFsr: FinalSellRemainderConfig = {
        artifacts: false,
        accessories: false,
        levels: FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[],
        setsMode: FINAL_SELL_DEFAULT_SETS_MODE,
      }
      let nextGearInspectorItems: GearInspectorItem[] = []
      let nextPreviewMode: 'rules' | 'gearInspector' = 'rules'
      let nextLogicHubOpen = false
      let nextSafeguardRules: SafeguardRule[] = []
      // App defaults: both toggles on, final sell off — mirror startTutorial() and app initial state.
      let nextSafeguardsEnabled = true
      let nextRecipesEnabled = true
      let nextLogicHubDialogTab: LogicHubDialogTab = LOGIC_HUB_DIALOG_TAB_FINAL_SELL
      let nextBuilderMode: 'recipe' | 'safeguard' = 'recipe'
      let nextNote: string | null = null
      let nextBuilder: BuilderRecipe = { ...TUTORIAL_INITIAL_BUILDER }
      const ensureSlowDD = () => {
        if (!nextMetas.some((meta) => meta.name.trim().toLowerCase() === 'slow dd')) {
          nextMetas = nextMetas.concat({ name: 'Slow DD', sets: [ArtifactSet.Lethal, ArtifactSet.Savage, ArtifactSet.Stoneskin], show: true, iconId: DEFAULT_METASET_ICON_ID })
        }
      }
      // Track which tutorial-driven additions have been replayed so the flags
      // can be written back after the loop — keeping Next button logic in sync.
      let basicAdded = false
      let advancedAdded = false
      let autoLateAdded = false
      let slowDDAdded = false
      let defaultMetasAdded = false
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
            nextBuilder = { ...nextBuilder, artifactSets: [{ id: ArtifactSet.Speed }] }
            break
          }
          case 'added': {
            // Commit Recipe #1 here, not at 'add' — 'add' shows the button before the click.
            nextRecipes = nextRecipes.concat(nextBuilder)
            nextSel = nextRecipes.length - 1
            basicAdded = true
            break
          }
          case 'adv-select-slots-main': {
            // DEF% omitted from the demo to keep it tight — body text mentions it as an option.
            nextBuilder = {
              ...nextBuilder,
              artifactTypes: [ArtifactType.Chestplate, ArtifactType.Boots],
              mainStatsV: [StatVariant.HP, StatVariant.ATK],
            }
            break
          }
          case 'name': {
            nextBuilder = { ...nextBuilder, name: 'DPS Core Rolls' }
            break
          }
          case 'subs': {
            // Lock only SPD — CR and CDMG are required but carry no per-stat roll floor.
            // Required=2 avoids the "required equals locked" warning (2 ≠ 1 locked).
            // Flex remains OFF until the dedicated Flex section explains and enables it.
            nextBuilder = {
              ...nextBuilder,
              substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
              fixedSubstatsV: [StatVariant.SPD],
              autoMinCount: false,
              minCount: 2,
              autoSubstatFlex: false,
            }
            break
          }
          case 'required': {
            // Required = 2: locked SPD always fills one slot, CR or CDMG fills the other.
            // Flex stays OFF until the Flex section — mirrors the step's before() hook.
            nextBuilder = { ...nextBuilder, autoMinCount: false, minCount: 2 }
            break
          }
          case 'min-rolls': {
            nextBuilder = { ...nextBuilder, autoMinRequiredRolls: false, minRequiredRolls: 3 }
            break
          }
          case 'locked-min-rolls': {
            // SPD (the only locked substat) must carry at least 1 roll.
            nextBuilder = { ...nextBuilder, lockedMinRequiredRolls: 1 }
            break
          }
          case 'metasets-add': {
            // All tutorial metasets are pre-created in this step's before() hook.
            // Mirror that here: add Speed, Slow DD, and the three defaults to nextMetas.
            if (!nextMetas.some((m) => m.name.trim().toLowerCase() === 'speed-sets'))
              nextMetas = nextMetas.concat({ name: 'Speed-Sets', sets: [ArtifactSet.Speed, ArtifactSet.Perception, ArtifactSet.Protection], show: true, iconId: DEFAULT_METASET_ICON_ID })
            ensureSlowDD()
            slowDDAdded = true
            const wanted = new Set(['Nuker', 'Debuffer', 'Survivability'])
            const defs = defaultMetasets().filter((meta) => wanted.has(meta.name))
            const have = new Set(nextMetas.map((meta) => meta.name))
            const add = defs.filter((meta) => !have.has(meta.name))
            if (add.length) nextMetas = nextMetas.concat(add)
            defaultMetasAdded = true
            break
          }
          case 'sets-metasets-basic': {
            // Builder gets Speed-Sets (dirty); recipe stays empty so Apply button is enabled.
            const speed = nextMetas.find((m) => m.name.trim().toLowerCase() === 'speed-sets')
            if (speed) {
              nextBuilder = { ...nextBuilder, artifactMetaSets: [speed.name], artifactSets: [] }
            }
            nextSel = 0
            break
          }
          case 'sets-metasets-apply': {
            // Still dirty at step 14: builder has Speed-Sets, recipe does not yet.
            const speed = nextMetas.find((m) => m.name.trim().toLowerCase() === 'speed-sets')
            if (speed) {
              nextBuilder = { ...nextBuilder, artifactMetaSets: [speed.name], artifactSets: [] }
            }
            nextSel = 0
            break
          }
          case 'metasets-preview-basic': {
            // Speed-Sets is now committed — mirrors the state after the user clicked Apply.
            const speed = nextMetas.find((m) => m.name.trim().toLowerCase() === 'speed-sets')
            if (speed && nextRecipes.length > 0) {
              nextBuilder = { ...nextBuilder, artifactMetaSets: [speed.name], artifactSets: [] }
              nextRecipes = nextRecipes.map((r, i) => i === 0 ? { ...r, artifactMetaSets: [speed.name], artifactSets: [] } : r)
            }
            nextSel = 0
            break
          }
          case 'sets-metasets': {
            ensureSlowDD()
            const slow = nextMetas.find((meta) => meta.name.trim().toLowerCase() === 'slow dd')
            if (slow) nextBuilder = { ...nextBuilder, artifactMetaSets: [slow.name], artifactSets: [] }
            break
          }
          case 'adv-add': {
            // Commit Recipe #2 here — matches handleTutorialNext which commits on leaving adv-add.
            nextRecipes = nextRecipes.concat(nextBuilder)
            nextSel = nextRecipes.length - 1
            advancedAdded = true
            break
          }
          case 'flex-toggle': {
            // Builder has flex=true but committed recipe stays false — strict preview, dirty state.
            nextBuilder = { ...nextBuilder, autoSubstatFlex: true }
            const flexToggleIdx = nextRecipes.length - 1
            if (flexToggleIdx >= 0) nextRecipes = nextRecipes.map((r, i) => i === flexToggleIdx ? { ...r, autoSubstatFlex: false } : r)
            break
          }
          case 'flex-preview': {
            // Flex is committed here (mirrors flex-preview before()) — preview expands.
            nextBuilder = { ...nextBuilder, autoSubstatFlex: true }
            const flexPreviewIdx = nextRecipes.length - 1
            if (flexPreviewIdx >= 0) nextRecipes = nextRecipes.map((r, i) => i === flexPreviewIdx ? { ...r, autoSubstatFlex: true } : r)
            break
          }
          case 'auto-late-slot': {
            // Min Rolls is Auto here — the substats step overrides it to 3.
            nextBuilder = {
              ...nextBuilder,
              name: 'Banner SPD — Late 3 rolls',
              artifactTypes: [ArtifactType.Banner],
              artifactSets: [],
              artifactMetaSets: [],
              mainStatsV: [],
              substatsV: [StatVariant.SPD],
              fixedSubstatsV: [],
              autoMinCount: true,
              minCount: 1, // explicit sync — replay accumulates state without normalizeKeepWithAuto
              autoSubstatFlex: false,
              autoMinRequiredRolls: true,
              rarityCode: 0,
              rarityMode: 'auto',
              earlyKeepMode: 'early',
              autoRaritySupplementsThreshold: 'rare',
            }
            break
          }
          case 'auto-late-substats': {
            // Per-stat roll minimum of 3 for SPD — shows the green badge on the chip.
            nextBuilder = { ...nextBuilder, substatRollBoundsV: { [StatVariant.SPD]: { min: 3 } } }
            break
          }
          case 'auto-late-mode': {
            nextBuilder = { ...nextBuilder, earlyKeepMode: 'late' }
            break
          }
          case 'auto-late-chip': {
            nextBuilder = { ...nextBuilder }
            break
          }
          case 'auto-late-rolls': {
            nextBuilder = { ...nextBuilder, autoMinRequiredRolls: false, minRequiredRolls: 3 }
            break
          }
          case 'preview-highlight': {
            // Recipe #3 is committed here (not at 'auto-late-add') so that stepping
            // back to auto-late-add shows the Add button without a pre-existing recipe.
            nextRecipes = nextRecipes.concat(nextBuilder)
            nextSel = nextRecipes.length - 1
            autoLateAdded = true
            break
          }
          case 'preview-highlight-early': {
            // Same recipe as preview-highlight but with earlyKeepMode swapped to 'early' for comparison.
            nextRecipes = nextRecipes.map((r, i) => i === nextRecipes.length - 1 ? { ...r, earlyKeepMode: 'early' as const } : r)
            nextSel = nextRecipes.length - 1
            autoLateAdded = true
            break
          }
          case 'gear-inspector-open': {
            nextLogicHubOpen = false
            nextLogicHubDialogTab = LOGIC_HUB_DIALOG_TAB_GEAR
            nextPreviewMode = 'rules'
            break
          }
          case 'gear-inspector-dialog': {
            nextLogicHubOpen = true
            nextLogicHubDialogTab = LOGIC_HUB_DIALOG_TAB_GEAR
            nextPreviewMode = 'rules'
            break
          }
          case 'gear-inspector-add-manual': {
            nextLogicHubOpen = true
            nextLogicHubDialogTab = LOGIC_HUB_DIALOG_TAB_GEAR
            nextPreviewMode = 'rules'
            nextGearInspectorItems = buildTutorialGearInspectorItems()
            break
          }
          case 'gear-inspector-preview': {
            if (nextGearInspectorItems.length === 0) nextGearInspectorItems = buildTutorialGearInspectorItems()
            nextLogicHubOpen = false
            nextPreviewMode = 'gearInspector'
            break
          }
          case 'finalsell-dialog': {
            const levels = nextFsr.levels?.length ? nextFsr.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[])
            // Both artifact and accessory types enabled to demonstrate the full pipeline
            // (banner accessories fall through to Final Sell without a safeguard).
            nextFsr = { ...nextFsr, artifacts: true, accessories: true, levels }
            nextLogicHubDialogTab = LOGIC_HUB_DIALOG_TAB_FINAL_SELL
            break
          }
          case 'finalsell-preview': {
            // Show gear outcomes with Final Sell active but no safeguards yet.
            if (nextGearInspectorItems.length === 0) nextGearInspectorItems = buildTutorialGearInspectorItems()
            nextLogicHubOpen = false
            nextPreviewMode = 'gearInspector'
            break
          }
          case 'safeguards-intro': {
            // No rule yet at this step — the form starts blank.
            nextSafeguardRules = []
            nextSafeguardsEnabled = true
            nextLogicHubOpen = false
            nextBuilderMode = 'safeguard'
            break
          }
          case 'safeguards-rule': {
            if (nextSafeguardRules.length === 0) nextSafeguardRules = buildTutorialSafeguardRules()
            nextSafeguardsEnabled = true
            nextLogicHubOpen = false
            nextBuilderMode = 'safeguard'
            break
          }
          case 'safeguards-payoff': {
            // Payoff: show all three items in Gear Inspector with rules fully active.
            if (nextSafeguardRules.length === 0) nextSafeguardRules = buildTutorialSafeguardRules()
            nextSafeguardsEnabled = true
            nextLogicHubOpen = false
            nextBuilderMode = 'safeguard'
            if (nextGearInspectorItems.length === 0) nextGearInspectorItems = buildTutorialGearInspectorItems()
            nextPreviewMode = 'gearInspector'
            break
          }
          default:
            break
        }
      }
      // Suppress history so tutorial skips never create undo/redo entries.
      suppressHistorySnapshot()
      setHsf(nextHsf)
      setCustomRecipes(nextRecipes)
      setSelectedRecipeIdx(nextSel)
      setMetasets(nextMetas)
      setSubstatTargets(nextSubstatTargets)
      setFinalSellRemainder(nextFsr)
      setSafeguardRules(nextSafeguardRules)
      setSafeguardsEnabled(nextSafeguardsEnabled)
      setRecipesEnabled(nextRecipesEnabled)
      setGearInspectorItems(nextGearInspectorItems)
      setPreviewMode(nextPreviewMode)
      setLogicHubOpen(nextLogicHubOpen)
      setLogicHubDialogTab(nextLogicHubDialogTab)
      setBuilderMode(nextBuilderMode)
      setSfcNote(nextNote)
      setBuilder(nextBuilder)
      // Write the tutorial-added flags back so Next-button guards stay in sync
      // after any breadcrumb jump or backward navigation via this replay path.
      setTutorialAddedBasic(basicAdded)
      setTutorialAddedAdvanced(advancedAdded)
      setTutorialAddedAutoLate(autoLateAdded)
      setTutorialAddedSlowDD(slowDDAdded)
      setTutorialAddedDefaultMetas(defaultMetasAdded)
      setTutorialIdx(idx)
    } catch {
      setTutorialIdx(idx)
    }
  }, [
    closeAllTransientUi,
    setBuilder,
    setCustomRecipes,
    setFinalSellRemainder,
    setHsf,
    setSfcNote,
    setMetasets,
    setSubstatTargets,
    setSelectedRecipeIdx,
    setSafeguardRules,
    setSafeguardsEnabled,
    setRecipesEnabled,
    setGearInspectorItems,
    setPreviewMode,
    setBuilderMode,
    setLogicHubOpen,
    setLogicHubDialogTab,
    setTutorialAddedBasic,
    setTutorialAddedAdvanced,
    setTutorialAddedAutoLate,
    setTutorialAddedSlowDD,
    setTutorialAddedDefaultMetas,
    suppressHistorySnapshot,
    tutorialSteps,
  ])

  const triggerSfcLoadNudge = useCallback(() => {
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
    if (nudgeFadeTimerRef.current) clearTimeout(nudgeFadeTimerRef.current)
    setSfcLoadNudgeFading(false)
    setSfcLoadNudgeActive(true)
    // First time: 12 s so the user can read and notice; every subsequent trigger: 3 s.
    const SFC_NUDGE_SEEN_KEY = 'sellfileCreator.sfcNudge.seen'
    const firstTime = localStorage.getItem(SFC_NUDGE_SEEN_KEY) !== '1'
    const visibleMs = firstTime ? 12_000 : 3_000
    try { localStorage.setItem(SFC_NUDGE_SEEN_KEY, '1') } catch {}
    nudgeTimerRef.current = setTimeout(() => {
      setSfcLoadNudgeFading(true)
      // Remove from DOM 700 ms after the fade-out animation starts.
      nudgeFadeTimerRef.current = setTimeout(() => {
        setSfcLoadNudgeActive(false)
        setSfcLoadNudgeFading(false)
      }, 700)
    }, visibleMs)
  }, [])

  const clearSfcLoadNudge = useCallback(() => {
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
    if (nudgeFadeTimerRef.current) clearTimeout(nudgeFadeTimerRef.current)
    setSfcLoadNudgeActive(false)
    setSfcLoadNudgeFading(false)
  }, [])

  const handleTutorialClose = useCallback(() => {
    closeAllTransientUi()
    restoreFromTutorialSnapshot()
    setTutorialSnapshot(null)
    setTutorialOpen(false)
    triggerSfcLoadNudge()
  }, [closeAllTransientUi, restoreFromTutorialSnapshot, triggerSfcLoadNudge])

  const handleTutorialPrev = useCallback(() => {
    // Delegate to the replay path so all state changes (recipes, metasets, flags)
    // are always derived from a clean forward pass — no separate undo logic needed.
    handleTutorialSkipTo(Math.max(0, tutorialIdx - 1))
  }, [handleTutorialSkipTo, tutorialIdx])

  const handleTutorialNext = useCallback(() => {
    try {
      const cur = tutorialSteps[tutorialIdx]
      if (cur?.id === 'add' && !tutorialAddedBasic) {
        setTutorialAddedBasic(true)
        // Suppress history so tutorial inserts do not add undo/redo entries.
        suppressHistorySnapshot()
        const snap = builderRef.current
        setCustomRecipes((prev) => {
          const insertIdx = (selectedRecipeIdx !== null && selectedRecipeIdx >= 0 && selectedRecipeIdx < prev.length)
            ? selectedRecipeIdx + 1
            : prev.length
          const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
          setSelectedRecipeIdx(insertIdx)
          return next
        })
      } else if (cur?.id === 'adv-add' && !tutorialAddedAdvanced) {
        setTutorialAddedAdvanced(true)
        // Suppress history so tutorial inserts do not add undo/redo entries.
        suppressHistorySnapshot()
        const snap = builderRef.current
        setCustomRecipes((prev) => {
          const insertIdx = (selectedRecipeIdx !== null && selectedRecipeIdx >= 0 && selectedRecipeIdx < prev.length)
            ? selectedRecipeIdx + 1
            : prev.length
          const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
          setSelectedRecipeIdx(insertIdx)
          return next
        })
      } else if (cur?.id === 'metasets-add' && !tutorialAddedSlowDD) {
        // Metasets are pre-created in the step's before() hook; just record that they exist.
        setTutorialAddedSlowDD(true)
      } else if (cur?.id === 'sets-metasets-apply') {
        // Apply the Speed-Sets metaset to committed Recipe #1 — mirrors the step's before() hook.
        // The DOM click is a best-effort visual cue; state is set directly for reliability.
        try {
          const speed = metasets.find((meta) => meta.name.trim().toLowerCase() === 'speed-sets')
          if (speed) {
            try {
              const section = document.querySelector('[data-tour-id="menu.metasets.section"]') as HTMLElement | null
              if (section) {
                const items = Array.from(section.querySelectorAll('*')) as HTMLElement[]
                const match = items.find((el) => (el.textContent || '').trim().toLowerCase() === 'speed-sets')
                match?.click()
              }
            } catch {}
            suppressHistorySnapshot()
            setBuilder((prev) => ({ ...prev, artifactMetaSets: [speed.name], artifactSets: [] }))
            setCustomRecipes((prev) => prev.map((r, i) => i === 0 ? { ...r, artifactMetaSets: [speed.name], artifactSets: [] } : r))
          }
        } catch {}
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
            // Suppress history so tutorial builder updates do not add undo/redo entries.
            suppressHistorySnapshot()
            setBuilder((prev) => ({
              ...prev,
              artifactMetaSets: [slow.name],
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
        // Suppress history so tutorial inserts do not add undo/redo entries.
        suppressHistorySnapshot()
        const snap = builderRef.current
        setCustomRecipes((prev) => {
          const insertIdx = (selectedRecipeIdx !== null && selectedRecipeIdx >= 0 && selectedRecipeIdx < prev.length)
            ? selectedRecipeIdx + 1
            : prev.length
          const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
          setSelectedRecipeIdx(insertIdx)
          return next
        })
      }
    } catch {}
    setTutorialIdx((value) => {
      const next = value + 1
      if (next >= tutorialSteps.length) {
        try { localStorage.setItem(TUTORIAL_SEEN_VERSION_KEY, APP_VERSION) } catch {}
        triggerSfcLoadNudge()
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
    selectedRecipeIdx,
    setBuilder,
    setCustomRecipes,
    setSelectedRecipeIdx,
    suppressHistorySnapshot,
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
    triggerSfcLoadNudge,
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
    sfcLoadNudgeActive,
    sfcLoadNudgeFading,
    triggerSfcLoadNudge,
    clearSfcLoadNudge,
  }
}
