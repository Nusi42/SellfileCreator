import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { APP_VERSION } from './version'
import { parseHsfFile } from './lib/hsf'
import { rarityCodeToName, formatRank, artifactTypeNames, artifactSetNames, StatId, formatSubstat, parseSubstat, parseMainStat, mainToVariant, subToVariant, variantToSub, labelOfVariant, StatVariant } from './lib/types'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { buildHsfRules, type BuilderConfig, defaultMinima, type MinimaTable } from './lib/hsfBuilder'
import { findObsoleteRules } from './lib/hsfObsolete'
import { type Metaset, defaultMetasets, resolveMetasetIds } from './lib/metasets'

// (local-only) legacy type removed; App uses BuilderPanel for editing

// Lightweight type guards/helpers to keep parsing typesafe
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null }
function asNumber(v: unknown): number | undefined { return typeof v === 'number' && Number.isFinite(v) ? v : undefined }
function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? (v as unknown[]).map((s) => String(s)) : undefined
}
function asNumberArray(v: unknown): number[] | undefined {
  return Array.isArray(v) ? (v as unknown[]).map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n)) : undefined
}
function parseSubstatLike(v: unknown): { id: number; isFlat: boolean } | undefined {
  if (typeof v === 'string') {
    const parsed = parseSubstat(v)
    if (parsed) return parsed
  }
  if (isRecord(v)) {
    const id = asNumber((v as Record<string, unknown>).id)
    const isFlat = Boolean((v as Record<string, unknown>).isFlat)
    if (typeof id === 'number' && Number.isFinite(id)) return { id, isFlat }
  }
  return undefined
}
function parseMainStatLike(v: unknown): { id: number; f?: number } | undefined {
  if (typeof v === 'string') {
    const parsed = parseMainStat(v)
    if (parsed) return parsed
  }
  if (isRecord(v)) {
    const id = asNumber(v.id)
    const fRaw = (v as Record<string, unknown>)['f']
    if (typeof id === 'number' && Number.isFinite(id)) {
      if (fRaw === undefined) return { id }
      const f = Number(fRaw)
      return Number.isFinite(f) ? { id, f } : { id }
    }
  }
  return undefined
}

// Normalize legacy HSFR configs to current BuilderConfig
function normalizeConfig(input: unknown): BuilderConfig {
  const rec: Record<string, unknown> = isRecord(input) ? input : {}
  const typeIdByName = new Map<string, number>(Object.entries(artifactTypeNames).map(([k,v]) => [v, Number(k)]))
  const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k,v]) => [v, Number(k)]))
  const legacyRank = (rec as Record<string, unknown>).rank as { kind?: string; value?: unknown } | undefined
  let rankCode: number = typeof rec['rankCode'] === 'number' ? (rec['rankCode'] as number) : 0
  if (rankCode === 0 && legacyRank && typeof legacyRank === 'object') {
    if (legacyRank.kind === 'any') rankCode = 0
    else if (legacyRank.kind === 'min') {
      const v = Number(legacyRank.value)
      if (v >= 1 && v <= 5) rankCode = v + 6
      else if (v >= 6) rankCode = 6
    } else if (legacyRank.kind === 'exact') {
      rankCode = Number(legacyRank.value) || 0
    }
  }
  if (typeof rec['Rank'] === 'string') {
    const label = String(rec['Rank'])
    for (let c = 0; c <= 16; c++) { if (formatRank(c) === label) { rankCode = c; break } }
  }
  // rankCodeByLabel no longer used; matched above by scanning formatRank labels

  const legacyRarity = rec['rarityExact'] as unknown
  let rarityCode: number = typeof rec['rarityCode'] === 'number' ? Number(rec['rarityCode']) : 0
  if (rarityCode === 0 && typeof legacyRarity === 'string') {
    const map: Record<string, number> = {
      Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Mythical: 15,
    }
    rarityCode = map[legacyRarity] ?? 0
  }

  const mainStatRaw = rec['mainStat']
  const mainStat = isRecord(mainStatRaw) ? mainStatRaw : { any: true } as { any?: boolean }
  const mainStatsArr: Array<{ id: number; f?: number }> = Array.isArray(rec['mainStats'])
    ? ((rec['mainStats'] as unknown[]).map((x: unknown) => parseMainStatLike(x)).filter((x: unknown): x is { id: number; f?: number } => Boolean(x)))
    : (((((mainStat as { any?: boolean }).any)) ? [] : [parseMainStatLike(mainStat)]).filter((x): x is { id: number; f?: number } => Boolean(x)))
  // Compute mainStatVariants: prefer explicit field if provided (accepts strings or numbers), else derive from mainStatsArr
  const mainStatVariants = mainStatsArr.map(ms => mainToVariant(ms.id, ms.f))
  // Determine roll mode first (used to normalize startLevel)
  const rollMode: BuilderConfig['rollMode'] = (() => {
    const m = rec['rollMode'] as unknown
    if (m === 'off' || m === 'strict' || m === 'potential' || m === 'auto') return m
    if (rec['generateRollPermutations'] === false) return 'off'
    if (rec['potentialKeep'] === true) return 'potential'
    if (rec['generateRollPermutations'] === true) return 'strict'
    return 'potential'
  })()

  // Normalize start level; allow 'any' only if rollMode is 'off'
  const startLevel: BuilderConfig['startLevel'] = ((): BuilderConfig['startLevel'] => {
    const raw = rec['startLevel'] as unknown
    if (rollMode === 'off' && raw === 'any') return 'any'
    if (typeof raw === 'number' && [0, 4, 8, 12, 16].includes(raw)) return raw as 0|4|8|12|16
    return 0
  })()

  const baseCfg: BuilderConfig = {
    name: typeof rec['name'] === 'string' ? String(rec['name']) : '',
    keep: Boolean((rec['keep'] ?? true) as boolean),
    enabled: rec['enabled'] !== false,
    rankCode,
    rarityCode,
    factionCode: typeof rec['factionCode'] === 'number' ? Number(rec['factionCode']) : 0,
    mainStats: mainStatsArr,
    startLevel,
    rollBaseline: (rec['rollBaseline'] === 'upToLevel') ? 'upToLevel' : 'afterStart',
    rollMode,
    substats: Array.isArray(rec['substats']) ? ((rec['substats'] as unknown[]).map((x: unknown) => parseSubstatLike(x)).filter((x: unknown): x is {id:number; isFlat:boolean} => Boolean(x))) : [],
    fixedSubstats: Array.isArray(rec['fixedSubstats']) ? ((rec['fixedSubstats'] as unknown[]).map((x: unknown) => parseSubstatLike(x)).filter((x: unknown): x is {id:number; isFlat:boolean} => Boolean(x))) : [],
    mainStatVariants,
    substatVariants: (Array.isArray(rec['substats']) ? (rec['substats'] as unknown[]) : []).map((x: unknown) => parseSubstatLike(x)).filter((x: unknown): x is {id:number; isFlat:boolean} => Boolean(x)).map((s: {id:number; isFlat:boolean}) => subToVariant(s.id, s.isFlat)),
    fixedSubstatVariants: (Array.isArray(rec['fixedSubstats']) ? (rec['fixedSubstats'] as unknown[]) : []).map((x: unknown) => parseSubstatLike(x)).filter((x: unknown): x is {id:number; isFlat:boolean} => Boolean(x)).map((s: {id:number; isFlat:boolean}) => subToVariant(s.id, s.isFlat)),
    minCount: (() => { const m = rec['minCount']; return (typeof m === 'number' && [0,1,2,3,4].includes(m)) ? (m as 0|1|2|3|4) : 0 })(),
    autoMinCount: Boolean((rec['autoMinCount'] ?? false) as boolean),
    // artifact filters assigned below conditionally
  }
  // Compute optional bounds and assign only if defined (for exactOptionalPropertyTypes)
  const __srb = (() => {
    const src = rec['substatRollBounds'] as unknown
    if (!src || typeof src !== 'object') return undefined
    const out: Record<string, { min?: number; max?: number; any?: boolean }> = {}
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const min = (v as Record<string, unknown>)['min']
      const max = (v as Record<string, unknown>)['max']
      const any = Boolean((v as Record<string, unknown>)['any'])
      const mv: { min?: number; max?: number; any?: boolean } = {}
      if (typeof min === 'number' && min >= 0) mv.min = Math.min(5, Math.floor(min))
      if (typeof max === 'number' && max >= 0) mv.max = Math.min(5, Math.floor(max))
      if (any) mv.any = true
      // Keep entries that specify min/max or explicitly request wildcard (any)
      let key = k; if (!k.includes(':')) { const p = parseSubstat(k); if (p) key = `${p.id}:${p.isFlat}`; }
      if (mv.min !== undefined || mv.max !== undefined || mv.any) out[key] = mv
    }
    return Object.keys(out).length ? out : undefined
  })()
  const __srbV = (() => {
    const src = rec['substatRollBounds'] as unknown
    if (!src || typeof src !== 'object') return undefined
    const out: Record<number, { min?: number; max?: number; any?: boolean }> = {}
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const [idStr, flatStr] = String(k).split(':')
      const id = Number(idStr); const isFlat = flatStr === 'true'
      const min = (v as Record<string, unknown>)['min']
      const max = (v as Record<string, unknown>)['max']
      const any = Boolean((v as Record<string, unknown>)['any'])
      const mv: { min?: number; max?: number; any?: boolean } = {}
      if (typeof min === 'number' && min >= 0) mv.min = Math.min(5, Math.floor(min))
      if (typeof max === 'number' && max >= 0) mv.max = Math.min(5, Math.floor(max))
      if (any) mv.any = true
      const vk = subToVariant(id, isFlat) as number
      if (mv.min !== undefined || mv.max !== undefined || mv.any) out[vk] = mv
    }
    return Object.keys(out).length ? out : undefined
  })()
  const opt: Partial<BuilderConfig> = {}
  if (__srb !== undefined) opt.substatRollBounds = __srb
  if (__srbV !== undefined) opt.substatRollBoundsV = __srbV
  const __artTypes = Array.isArray(rec['artifactTypeNames'])
    ? ((rec['artifactTypeNames'] as unknown[]).map((n: unknown) => typeIdByName.get(String(n))).filter((x: unknown): x is number => typeof x === 'number'))
    : asNumberArray(rec['artifactTypes'])
  const __artSets = Array.isArray(rec['artifactSetNames'])
    ? ((rec['artifactSetNames'] as unknown[]).map((n: unknown) => setIdByName.get(String(n))).filter((x: unknown): x is number => typeof x === 'number'))
    : asNumberArray(rec['artifactSets'])
  const __artMetaSets = asStringArray(rec['artifactMetaSets'])
  if (__artTypes !== undefined) opt.artifactTypes = __artTypes
  if (__artSets !== undefined) opt.artifactSets = __artSets
  if (__artMetaSets !== undefined) opt.artifactMetaSets = __artMetaSets
  const normalized: BuilderConfig = { ...baseCfg, ...opt }
  return normalized
}

// CRC32 for autosave integrity
const CRC32_TABLE: number[] = (() => {
  const t: number[] = new Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32Hex(s: string): string {
  let crc = 0 ^ -1
  for (let i = 0, l = s.length; i < l; i++) {
    const code = s.charCodeAt(i)
    const b = code & 0xFF
    const idx = (crc ^ b) & 0xFF
    const tbl = CRC32_TABLE[idx]!
    crc = (crc >>> 8) ^ tbl
  }
  crc = (crc ^ -1) >>> 0
  return crc.toString(16).padStart(8, '0').toUpperCase()
}

import {
    Box,
    Button,
    Container,
    // Divider,
    Paper,
    Stack,
    Typography,
    TextField,
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

// Components are organized under src/components

export default function App() {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  const [customCfgs, setCustomCfgs] = useState<BuilderConfig[]>([])
  const AUTOSAVE_KEY = 'autosave.hsfr.v1'
  const [restoreDlgOpen, setRestoreDlgOpen] = useState(false)
  const [restoreDraft, setRestoreDraft] = useState<null | { Version?: string; Metasets?: Metaset[]; Minima?: MinimaTable; Configs?: BuilderConfig[]; IncludeAllExplicitMeta?: boolean; SelectedConfigIndex?: number }>(null)
  const [autosaveReady, setAutosaveReady] = useState(false)
  const loadedAutosaveRef = useRef<null | { Version?: string; Metasets?: Metaset[]; Minima?: MinimaTable; Configs?: BuilderConfig[]; IncludeAllExplicitMeta?: boolean; SelectedConfigIndex?: number }>(null)
  const [selectedCfgIdx, setSelectedCfgIdx] = useState<number | null>(null)
  const [metasets, setMetasets] = useState<Metaset[]>(defaultMetasets())
  const [minima, setMinima] = useState<MinimaTable>(defaultMinima())
  const [hoveredCfgIdx, setHoveredCfgIdx] = useState<number | null>(null)
  const [includeAllExplicitMeta, setIncludeAllExplicitMeta] = useState<boolean>(false)
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
  const DEFAULT_SUBSTAT_COLORS_FG: Record<number, string> = {
    [StatId.HP]: '#8BC34A', // HP% lime green (percent)
    [StatId.ATK]: '#FF7043', // ATK% orange/red (percent)
    [StatId.DEF]: '#64B5F6', // DEF% light blue (percent)
    [StatId.SPD]: '#BA68C8', // SPD purple
    [StatId.RES]: '#FFD54F', // RES yellow
    [StatId.ACC]: '#2979FF', // ACC deep blue (distinct from DEF)
    [StatId.CR]: '#00E5FF', // CR% vivid aqua (distinct from ACC/DEF)
    [StatId.CDMG]: '#FF80AB', // CDMG% bright pink for readability
  }
  const DEFAULT_SUBSTAT_COLORS_BG: Record<number, string> = {
    [StatId.HP]: '#1E2E14', // HP% dark lime tint
    [StatId.ATK]: '#2F1A14', // ATK% dark orange/red tint
    [StatId.DEF]: '#0F2234', // DEF% dark blue tint
    [StatId.SPD]: '#2A1C2F', // SPD dark purple tint
    [StatId.RES]: '#3A2F15', // RES dark yellow/brown tint
    [StatId.ACC]: '#0A1E40', // ACC dark navy tint
    [StatId.CR]: '#062833', // CR% dark aqua/teal tint
    [StatId.CDMG]: '#2A0F1E', // CDMG% dark magenta/red wine tint (higher contrast)
  }
  // defaultSubstatColorMap (unused) removed
  const COLORS_STORAGE_KEY_V4 = 'substatColors.v4'
  const COLORS_STORAGE_KEY_V3 = 'substatColors.v3'
  const COLORS_STORAGE_KEY_V2 = 'substatColors.v2'
  const COLORS_STORAGE_KEY_V1 = 'substatColors.v1'
  const defaultSubstatColorMapV3 = (): Record<string, { fg: string; bg: string }> => {
    const base: Record<string, { fg: string; bg: string }> = {}
    for (const id of [StatId.HP,StatId.ATK,StatId.DEF,StatId.SPD,StatId.RES,StatId.ACC,StatId.CR,StatId.CDMG]) {
      base[`${id}:1`] = { fg: DEFAULT_SUBSTAT_COLORS_FG[id]!, bg: DEFAULT_SUBSTAT_COLORS_BG[id]! } // flat
      base[`${id}:0`] = { fg: DEFAULT_SUBSTAT_COLORS_FG[id]!, bg: DEFAULT_SUBSTAT_COLORS_BG[id]! } // percent
    }
    // Distinguish % vs flat for HP/ATK/DEF: flat slightly darker than %
    // HP
    base[`${StatId.HP}:0`] = { fg: '#8BC34A', bg: '#1E2E14' } // HP%
    base[`${StatId.HP}:1`] = { fg: '#689F38', bg: '#16250F' } // HP flat darker
    // ATK
    base[`${StatId.ATK}:0`] = { fg: '#FF7043', bg: '#2F1A14' } // ATK%
    base[`${StatId.ATK}:1`] = { fg: '#E64A19', bg: '#27140F' } // ATK flat darker
    // DEF
    base[`${StatId.DEF}:0`] = { fg: '#64B5F6', bg: '#0F2234' } // DEF%
    base[`${StatId.DEF}:1`] = { fg: '#42A5F5', bg: '#0C1C2C' } // DEF flat darker
    // SPD
    base[`${StatId.SPD}:0`] = { fg: '#BA68C8', bg: '#2A1C2F' }
    base[`${StatId.SPD}:1`] = { fg: '#BA68C8', bg: '#2A1C2F' }
    // RES
    base[`${StatId.RES}:0`] = { fg: '#FFD54F', bg: '#3A2F15' }
    base[`${StatId.RES}:1`] = { fg: '#FFD54F', bg: '#3A2F15' }
    // ACC (deep blue)
    base[`${StatId.ACC}:0`] = { fg: '#2979FF', bg: '#0A1E40' }
    base[`${StatId.ACC}:1`] = { fg: '#2979FF', bg: '#0A1E40' }
    // CR% (vivid aqua)
    base[`${StatId.CR}:0`] = { fg: '#00E5FF', bg: '#062833' }
    base[`${StatId.CR}:1`] = { fg: '#00E5FF', bg: '#062833' }
    // CDMG% (bright pink)
    base[`${StatId.CDMG}:0`] = { fg: '#FF80AB', bg: '#2A0F1E' }
    base[`${StatId.CDMG}:1`] = { fg: '#FF80AB', bg: '#2A0F1E' }
    return base
  }
  const [substatColors, setSubstatColors] = useState<Record<string, { fg: string; bg: string }>>(() => {
    try {
      // Try v4 (per variant fg+bg) — updated palette closer to in-game colors
      const rawV4 = localStorage.getItem(COLORS_STORAGE_KEY_V4)
      if (rawV4) {
        const parsed = JSON.parse(rawV4)
        if (parsed && typeof parsed === 'object') return { ...defaultSubstatColorMapV3(), ...parsed }
      }
      // Fallback: migrate v3 (fg+bg per variant)
      const rawV3 = localStorage.getItem(COLORS_STORAGE_KEY_V3)
      if (rawV3) {
        const parsed = JSON.parse(rawV3)
        if (parsed && typeof parsed === 'object') return { ...defaultSubstatColorMapV3(), ...parsed }
      }
      // Fallback: migrate v2 (fg+bg per id)
      const rawV2 = localStorage.getItem(COLORS_STORAGE_KEY_V2)
      if (rawV2) {
        const parsedV2 = JSON.parse(rawV2)
        if (parsedV2 && typeof parsedV2 === 'object') {
          const base = defaultSubstatColorMapV3()
          for (const [k,v] of Object.entries(parsedV2 as Record<string, { fg: string; bg: string }>)) {
            const id = Number(k)
            if (!Number.isFinite(id)) continue
            base[`${id}:1`] = { fg: v.fg, bg: v.bg }
            base[`${id}:0`] = { fg: v.fg, bg: v.bg }
          }
          return base
        }
      }
      // Fallback: migrate v1 (fg only per id)
      const rawV1 = localStorage.getItem(COLORS_STORAGE_KEY_V1)
      if (rawV1) {
        const parsedV1 = JSON.parse(rawV1)
        if (parsedV1 && typeof parsedV1 === 'object') {
          const base = defaultSubstatColorMapV3()
          for (const [k,v] of Object.entries(parsedV1)) {
            const id = Number(k)
            if (!Number.isFinite(id)) continue
            base[`${id}:1`] = { fg: String(v), bg: (DEFAULT_SUBSTAT_COLORS_BG[id] ?? base[`${id}:1`]?.bg ?? '#000000') }
            base[`${id}:0`] = { fg: String(v), bg: (DEFAULT_SUBSTAT_COLORS_BG[id] ?? base[`${id}:0`]?.bg ?? '#000000') }
          }
          return base
        }
      }
      return defaultSubstatColorMapV3()
    } catch { return defaultSubstatColorMapV3() }
  })
  useEffect(() => {
    try { localStorage.setItem(COLORS_STORAGE_KEY_V4, JSON.stringify(substatColors)) } catch {}
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
  const [builder, setBuilder] = useState<BuilderConfig>({
    name: '',
    keep: true,
    rankCode: 0,
    rarityCode: 0,
    factionCode: 0,
    mainStats: [],
    mainStatVariants: [],
    startLevel: 0,
    rollBaseline: 'afterStart',
    rollMode: 'auto',
    substats: [],
    substatVariants: [],
    fixedSubstats: [],
    fixedSubstatVariants: [],
    minCount: 0,
    autoMinCount: true,
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


  async function writeClipboard(text: string) {
    try {
      // Only trust navigator.clipboard in secure contexts; otherwise signal failure
      if (!window.isSecureContext) return false
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return false
      await navigator.clipboard.writeText(text)
      return true
    } catch (e) {
      // Try legacy execCommand as a best-effort, but still report failure so UI shows fallback dialog
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-10000px'
        document.body.appendChild(ta)
        ta.focus(); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {}
      return false
    }
  }
  async function readClipboard(): Promise<string | null> {
    try {
      const t = await navigator.clipboard.readText()
      return t ?? ''
    } catch (e) {
      console.error('Clipboard read failed', e)
      return null
    }
  }

  // Removed name-based copy suffix mechanics.

  // For a duplicate action on index `idx`, insert the new copy after the last
  // contiguous sibling that shares the same base name, starting from idx.
  // Compute insertion index strictly based on config index: always after idx.
  function insertIndexAfter(list: BuilderConfig[], idx: number): number {
    return Math.min(list.length, idx + 1)
  }
  function parseConfigsFromText(text: string): BuilderConfig[] {
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed)) return parsed.map(normalizeConfig)
      if (isRecord(parsed)) {
        const cfgs = Array.isArray(parsed['Configs']) ? (parsed['Configs'] as unknown[]) : []
        return cfgs.length ? cfgs.map(normalizeConfig) : [normalizeConfig(parsed)]
      }
    } catch (err) {
      console.error('Failed to parse clipboard as JSON', err)
    }
    return []
  }
  function handlePasteText(text: string) {
    const cfgs = parseConfigsFromText(text)
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

  async function pasteAfterIndex(idx: number) {
    // Try clipboard first
    const text = await readClipboard()
    if (text && text.trim()) {
      const cfgs = parseConfigsFromText(text)
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
        return { cfgIdx, cfg: { ...c, artifactSets: union } }
      })
      .flatMap(({ cfgIdx, cfg }) => buildHsfRules(cfg, minima).map((r): HsfRule & { __cfgIdx: number } => ({ ...r, __cfgIdx: cfgIdx })))

    // Build and then remove obsolete rules, but only when both the obsolete rule
    // and its covering rule originate from the same custom config. This preserves
    // duplicated configs and base-vs-custom overlaps in the preview.
    const merged: (HsfRule & { __cfgIdx?: number })[] = (base as (HsfRule & { __cfgIdx?: number })[]).concat(customs)
    const { obsolete } = findObsoleteRules(merged)
    if (obsolete.length === 0) return merged
    const toDrop = new Set<number>()
    for (const o of obsolete) {
      const a = merged[o.index]
      const b = merged[o.coveredBy]
      const aCfg = a && a.__cfgIdx
      const bCfg = b && b.__cfgIdx
      if (aCfg !== undefined && bCfg !== undefined && aCfg === bCfg) {
        toDrop.add(o.index)
      }
    }
    const filtered = merged.filter((_, idx) => !toDrop.has(idx))
    return filtered
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
      const raw = localStorage.getItem(AUTOSAVE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed) || parsed.length < 2) return
      const [crc, data] = parsed
      const dataStr = JSON.stringify(data)
      if (typeof crc === 'string' && crc === crc32Hex(dataStr)) {
        // Only prompt if there are no existing custom configs
        if (customCfgs.length === 0 && data && typeof data === 'object') {
          const dataRec = data as Record<string, unknown>
          const cfgs = Array.isArray(dataRec['Configs']) ? (dataRec['Configs'] as unknown[]).map(normalizeConfig) : []
          // If autosaved content is essentially the same as initial defaults, skip dialog
          const savedMetasetsRaw = Array.isArray(dataRec['Metasets']) ? (dataRec['Metasets'] as unknown[]) : undefined
          const setIdByName_autosave = new Map<string, number>(Object.entries(artifactSetNames).map(([k,v]) => [v, Number(k)]))
          const savedMetasets = Array.isArray(savedMetasetsRaw)
            ? savedMetasetsRaw.map((m: unknown) => {
                const mRec = m as Record<string, unknown>
                const names: unknown[] = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
                const sets: number[] = Array.isArray(mRec['sets']) ? (mRec['sets'] as number[]) : names.map(n => setIdByName_autosave.get(String(n))).filter((x): x is number => typeof x === 'number')
                return { id: String(mRec['id']), name: String(mRec['name']), sets, show: mRec['show'] !== false }
              })
            : undefined
          const savedMinima = dataRec['Minima'] as MinimaTable | undefined
          const savedIncludeAll = Boolean(dataRec['IncludeAllExplicitMeta'])
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
          const essentiallyDefault = cfgs.length === 0 && metasetsMatchDefaults && minimaMatchDefaults && includeAllMatchesDefault
          if (essentiallyDefault) { setAutosaveReady(true); return }
          const draft = {
            Version: String(dataRec['Version'] ?? ''),
            ...(Array.isArray(dataRec['Metasets']) ? { Metasets: (dataRec['Metasets'] as Metaset[]) } : {}),
            ...((dataRec['Minima'] && typeof dataRec['Minima'] === 'object') ? { Minima: dataRec['Minima'] as MinimaTable } : {}),
            Configs: cfgs,
            IncludeAllExplicitMeta: Boolean(dataRec['IncludeAllExplicitMeta']),
          }
          setRestoreDraft(draft)
          loadedAutosaveRef.current = draft
          setRestoreDlgOpen(true)
          // Defer autosave until user chooses restore/dismiss
          return
        }
      } else {
        // Corrupted autosave; clear it
        try { localStorage.removeItem(AUTOSAVE_KEY) } catch {}
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
        SelectedConfigIndex: selectedCfgIdx ?? undefined,
      }
      const curStr = JSON.stringify(cur)
      const baseStr = JSON.stringify(loadedAutosaveRef.current)
      if (curStr !== baseStr) setAutosaveReady(true)
    } catch {}
  }, [metasets, minima, customCfgs, includeAllExplicitMeta, selectedCfgIdx, autosaveReady])

  // Build autosave payload and keep a ref for synchronous flush on unload
  const autosavePayload = useMemo(() => ({
    Version: APP_VERSION,
    Metasets: metasets,
    Minima: minima,
    Configs: customCfgs,
    IncludeAllExplicitMeta: includeAllExplicitMeta,
    ...(selectedCfgIdx !== null ? { SelectedConfigIndex: selectedCfgIdx } : {}),
  }), [metasets, minima, customCfgs, includeAllExplicitMeta, selectedCfgIdx])
  type AutosavePayload = {
    Version: string
    Metasets?: Metaset[]
    Minima?: MinimaTable
    Configs: BuilderConfig[]
    IncludeAllExplicitMeta: boolean
    SelectedConfigIndex?: number
  }
  const autosaveRef = useRef<{ crc: string; payload: AutosavePayload } | null>(null)
  const autosaveInitSkipRef = useRef<boolean>(false)
  // Listen for child chip "open-copy-dialog" to open manual copy UI
  useEffect(() => {
    const onOpen = (e: Event) => {
      try {
        const detail = (e as CustomEvent<string>).detail
        if (typeof detail === 'string') { setCopyText(detail); setCopyDlgOpen(true) }
      } catch {}
    }
    window.addEventListener('open-copy-dialog', onOpen as EventListener)
    return () => window.removeEventListener('open-copy-dialog', onOpen as EventListener)
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
    try {
      const dataStr = JSON.stringify(autosavePayload)
      const crc = crc32Hex(dataStr)
      autosaveRef.current = { crc, payload: autosavePayload }
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify([crc, autosavePayload]))
    } catch {}
  }, [autosavePayload])
  useEffect(() => {
    const flush = () => {
      try {
        const cur = autosaveRef.current
        if (!cur) return
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify([cur.crc, cur.payload]))
      } catch {}
    }
    const onVis = () => { if (document.hidden) flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  

  function onHsfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const inputEl = e.target as HTMLInputElement
    const file = inputEl.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result)
        const parsed = parseHsfFile(text)
        setHsf(parsed)
      } catch (err) {
        console.error('Failed to parse .hsf file', err)
        setHsf(null)
      } finally { try { inputEl.value = '' } catch {} }
    }
    reader.readAsText(file)
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
      <GlobalStyles styles={(theme) => ({
        '*, *::before, *::after': {
          scrollbarWidth: 'thin',
          scrollbarColor: `${theme.palette.divider} transparent`,
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
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2, flexWrap: 'wrap' }}>
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
                  const reader = new FileReader()
                  reader.onload = () => {
                    try {
                      const parsed = JSON.parse(String(reader.result)) as unknown
                      const parsedRec = isRecord(parsed) ? parsed : {}
                      const rawCfgs = Array.isArray(parsed) ? parsed : (Array.isArray(parsedRec['Configs']) ? (parsedRec['Configs'] as unknown[]) : [])
                      const nextCfgs = rawCfgs.map(normalizeConfig)
                      const nextMetas = (() => {
                        const raws = parsedRec['Metasets']
                        if (!Array.isArray(raws)) return metasets
                        const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k,v]) => [v, Number(k)]))
                      return raws.map((m: unknown) => {
                        const mRec = m as Record<string, unknown>
                        const names = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
                        const sets = Array.isArray(mRec['sets']) ? (mRec['sets'] as number[]) : names.map((n: unknown)=> setIdByName.get(String(n))).filter((x: unknown): x is number => typeof x === 'number')
                        return { id: String(mRec['id']), name: String(mRec['name']), sets, show: mRec['show'] !== false }
                      })
                      })()
                      const nextMinima = (!Array.isArray(parsed) && parsedRec['Minima']) ? (parsedRec['Minima'] as MinimaTable) : minima
                      const nextAllExplicit = (!Array.isArray(parsed) && typeof parsedRec['IncludeAllExplicitMeta'] === 'boolean') ? Boolean(parsedRec['IncludeAllExplicitMeta']) : includeAllExplicitMeta
                      setCustomCfgs(nextCfgs)
                      if (nextMetas !== metasets) setMetasets(nextMetas)
                      if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
                      if (nextAllExplicit !== includeAllExplicitMeta) setIncludeAllExplicitMeta(nextAllExplicit)
                      const savedSel = (!Array.isArray(parsed) && typeof parsedRec['SelectedConfigIndex'] === 'number') ? (parsedRec['SelectedConfigIndex'] as number) : (nextCfgs.length ? nextCfgs.length - 1 : null)
                      const sel = (savedSel !== null && savedSel >= 0 && savedSel < nextCfgs.length) ? savedSel : (nextCfgs.length ? nextCfgs.length - 1 : null)
                      setSelectedCfgIdx(sel)
                      if (sel !== null && nextCfgs[sel]) setBuilder(nextCfgs[sel]!)
                      try { setLastSavedSig(JSON.stringify({ customCfgs: nextCfgs, metasets: nextMetas, minima: nextMinima, includeAllExplicitMeta: nextAllExplicit })) } catch {}
                    } catch (err) {
                      console.error('Failed to parse .hsfr file', err)
                    } finally { try { inputEl.value = '' } catch {} }
                  }
                  reader.readAsText(file)
                }}
              />
            </Button>
            <Box
              sx={{ flexGrow: 1, minWidth: 260, p: 1.2, border: '1px dashed', borderColor: 'divider', borderRadius: 1, textAlign: 'center', color: 'text.secondary' }}
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  try {
                    const parsed = JSON.parse(String(reader.result)) as unknown
                    const parsedRec = isRecord(parsed) ? parsed : {}
                    const rawCfgs = Array.isArray(parsed) ? parsed : (Array.isArray(parsedRec['Configs']) ? (parsedRec['Configs'] as unknown[]) : [])
                    const nextCfgs = rawCfgs.map(normalizeConfig)
                    const nextMetas = (() => {
                      const raws = parsedRec['Metasets']
                      if (!Array.isArray(raws)) return metasets
                      const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k,v]) => [v, Number(k)]))
                      return raws.map((m: unknown) => {
                        const mRec = m as Record<string, unknown>
                        const names = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
                        const sets = Array.isArray(mRec['sets']) ? (mRec['sets'] as number[]) : names.map((n: unknown)=> setIdByName.get(String(n))).filter((x: unknown): x is number => typeof x === 'number')
                        return { id: String(mRec['id']), name: String(mRec['name']), sets, show: mRec['show'] !== false }
                      })
                    })()
                    const nextMinima = (!Array.isArray(parsed) && parsedRec['Minima']) ? (parsedRec['Minima'] as MinimaTable) : minima
                    const nextAllExplicit = (!Array.isArray(parsed) && typeof parsedRec['IncludeAllExplicitMeta'] === 'boolean') ? Boolean(parsedRec['IncludeAllExplicitMeta']) : includeAllExplicitMeta
                    setCustomCfgs(nextCfgs)
                    if (nextMetas !== metasets) setMetasets(nextMetas)
                    if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
                    if (nextAllExplicit !== includeAllExplicitMeta) setIncludeAllExplicitMeta(nextAllExplicit)
                    const savedSel = (!Array.isArray(parsed) && typeof parsedRec['SelectedConfigIndex'] === 'number') ? (parsedRec['SelectedConfigIndex'] as number) : (nextCfgs.length ? nextCfgs.length - 1 : null)
                    const sel = (savedSel !== null && savedSel >= 0 && savedSel < nextCfgs.length) ? savedSel : (nextCfgs.length ? nextCfgs.length - 1 : null)
                    setSelectedCfgIdx(sel)
                    if (sel !== null && nextCfgs[sel]) setBuilder(nextCfgs[sel]!)
                    try { setLastSavedSig(JSON.stringify({ customCfgs: nextCfgs, metasets: nextMetas, minima: nextMinima, includeAllExplicitMeta: nextAllExplicit })) } catch {}
                  } catch (err) {
                    console.error('Failed to parse dropped .hsfr file', err)
                  }
                }
                reader.readAsText(file)
              }}
            >
              Drag & drop Configs (.hsfr) here
            </Box>
            <Button
              startIcon={<SaveIcon />}
              onClick={() => {
                // Export a more readable HSFR: convert stat objects to human labels
                const toReadable = (cfg: BuilderConfig) => {
                  const mainLabels = (cfg.mainStats && cfg.mainStats.length)
                    ? cfg.mainStats.map(ms => labelOfVariant(mainToVariant(ms.id, ms.f)))
                    : (Array.isArray((cfg as (BuilderConfig & { mainStatVariants?: StatVariant[] })).mainStatVariants) ? ((cfg as (BuilderConfig & { mainStatVariants?: StatVariant[] })).mainStatVariants as StatVariant[]).map((v: StatVariant) => labelOfVariant(v)) : [])
                  const subLabels = (cfg.substats && cfg.substats.length)
                    ? cfg.substats.map(s => formatSubstat(s.id, s.isFlat))
                    : (Array.isArray((cfg as (BuilderConfig & { substatVariants?: StatVariant[] })).substatVariants) ? ((cfg as (BuilderConfig & { substatVariants?: StatVariant[] })).substatVariants as StatVariant[]).map((v: StatVariant) => { const o = variantToSub(v); return formatSubstat(o.id, o.isFlat) }) : [])
                  const fixedLabels = (cfg.fixedSubstats && cfg.fixedSubstats.length)
                    ? cfg.fixedSubstats.map(s => formatSubstat(s.id, s.isFlat))
                    : (Array.isArray((cfg as (BuilderConfig & { fixedSubstatVariants?: StatVariant[] })).fixedSubstatVariants) ? ((cfg as (BuilderConfig & { fixedSubstatVariants?: StatVariant[] })).fixedSubstatVariants as StatVariant[]).map((v: StatVariant) => { const o = variantToSub(v); return formatSubstat(o.id, o.isFlat) }) : [])
                  // Build an explicit, readable HSFR object (omit internal variant fields)
                  return {
                    name: cfg.name,
                    keep: cfg.keep,
                    enabled: cfg.enabled !== false,
                    Rank: formatRank(cfg.rankCode),
                    Rarity: rarityCodeToName(cfg.rarityCode),
                    factionCode: Number(cfg.factionCode ?? 0),
                    mainStats: mainLabels,
                    startLevel: cfg.startLevel,
                    rollBaseline: cfg.rollBaseline,
                    rollMode: cfg.rollMode,
                    substats: subLabels,
                    fixedSubstats: fixedLabels,
                    substatRollBounds: (() => {
                      const src = cfg.substatRollBounds ?? {}
                      const out: Record<string, { min?: number; max?: number; any?: boolean }> = {}
                      for (const [k,v] of Object.entries(src)) {
                        const [idStr, flatStr] = k.split(':')
                        const id = Number(idStr); const isFlat = flatStr === 'true'
                        const label = formatSubstat(id, isFlat)
                        out[label] = v as { min?: number; max?: number; any?: boolean }
                      }
                      return Object.keys(out).length ? out : undefined
                    })(),
                    minCount: cfg.minCount,
                    autoMinCount: cfg.autoMinCount,
                    artifactTypeNames: (cfg.artifactTypes ?? []).map(t => artifactTypeNames[Number(t)]).filter(Boolean),
                    artifactSetNames: (cfg.artifactSets ?? []).map(sv => artifactSetNames[Number(sv)]).filter(Boolean),
                    artifactMetaSets: cfg.artifactMetaSets,
                  }
                }
                // Convert Minima to label-keyed maps for readability
                const minimaReadable = (() => {
                  const conv = (rec: Record<string, number>) => {
                    const out: Record<string, number> = {}
                    for (const [k,v] of Object.entries(rec)) {
                      const [idStr, flatStr] = k.split(':')
                      const id = Number(idStr); const isFlat = flatStr === 'true'
                      const label = formatSubstat(id, isFlat)
                      out[label] = v
                    }
                    return out
                  }
                  return {
                    one: conv(minima.one),
                    two: conv(minima.two),
                    three: conv(minima.three),
                    four: conv(minima.four),
                    five: conv(minima.five),
                    six: conv(minima.six),
                  }
                })()
                const payload = {
                  Version: APP_VERSION,
                  Metasets: metasets.map(m => ({ id: m.id, name: m.name, setNames: m.sets.map(id => artifactSetNames[Number(id)]).filter(Boolean), show: m.show !== false })),
                  Minima: minimaReadable,
                  Configs: customCfgs.map(toReadable),
                  IncludeAllExplicitMeta: includeAllExplicitMeta,
                  SelectedConfigIndex: selectedCfgIdx ?? (customCfgs.length ? customCfgs.length - 1 : undefined),
                }
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
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
                const hsfr = { Version: APP_VERSION, Metasets: metasets, Minima: minima, Configs: customCfgs, IncludeAllExplicitMeta: includeAllExplicitMeta, SelectedConfigIndex: selectedCfgIdx ?? undefined }
                const text = JSON.stringify(hsfr, null, 2)
                const ok = await writeClipboard(text)
                setChipAreaMenu(null)
                if (!ok) { setCopyText(text); setCopyDlgOpen(true) }
              }}
              disabled={customCfgs.length === 0}
            >Copy All (Configs)</MenuItem>
            <MenuItem
              onClick={async () => {
                const text = await readClipboard()
                if (text && text.trim()) {
                  const cfgs = parseConfigsFromText(text)
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

          {/* Manual Paste dialog */}
          <Dialog open={pasteDlgOpen} onClose={() => setPasteDlgOpen(false)} maxWidth="md" fullWidth>
            <DialogTitle>Paste Config JSON</DialogTitle>
            <DialogContent>
              <Typography variant="body2" sx={{ mb: 1 }}>Paste a single config, an array of configs, or an HSFR object containing Configs.</Typography>
              <TextField
                multiline
                minRows={8}
                maxRows={16}
                fullWidth
                value={pasteText}
                onChange={(e) => { setPasteText(e.target.value); setPasteErr(null) }}
                placeholder='Example: {"keep":true, "rankCode":0, ...} or [{...}, {...}] or {"Configs": [...]}'
                error={Boolean(pasteErr)}
                helperText={pasteErr ?? ' '}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPasteDlgOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={() => {
                // Detect if we should select the last created
                const preLen = customCfgs.length
                const parsed = parseConfigsFromText(pasteText)
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
              }}>{selectedCfgIdx !== null ? 'Insert after selected' : 'Add to end'}</Button>
            </DialogActions>
          </Dialog>

          {/* Manual Copy dialog */}
          <Dialog open={copyDlgOpen} onClose={() => setCopyDlgOpen(false)} maxWidth="md" fullWidth>
            <DialogTitle>Copy Config JSON</DialogTitle>
            <DialogContent>
              <Typography variant="body2" sx={{ mb: 1 }}>Your browser blocked clipboard access. Select and copy manually.</Typography>
              <TextField
                multiline
                minRows={8}
                maxRows={16}
                fullWidth
                value={copyText}
                inputRef={copyInputRef}
                onFocus={(e) => { try { (e.target as HTMLTextAreaElement).select() } catch {} }}
                onChange={(e) => setCopyText(e.target.value)}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCopyDlgOpen(false)}>Close</Button>
            </DialogActions>
          </Dialog>
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
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap' }}>
        <Button component="label" startIcon={<UploadFileIcon />}>
          Load RSL Helper Sellfile
          <input hidden type="file" accept=".hsf,application/json" onChange={onHsfUpload} />
        </Button>
        <Button color="warning" onClick={() => setHsf(null)} disabled={!hsf}>Clear</Button>
        <Box
          sx={{ flexGrow: 1, minWidth: 260, p: 1.2, border: '1px dashed', borderColor: 'divider', borderRadius: 1, textAlign: 'center', color: 'text.secondary' }}
          onDragOver={(e) => { e.preventDefault() }}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              try {
                const text = String(reader.result)
                const parsed = parseHsfFile(text)
                setHsf(parsed)
              } catch (err) {
                console.error('Failed to parse dropped .hsf file', err)
              }
            }
            reader.readAsText(file)
          }}
        >
          Drag & drop RSL Helper Sellfile here
        </Box>
        {hsf && (
          <Typography variant="caption" color="text.secondary">
            {`Loaded ${hsf.Rules.length} base rules`}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
              startIcon={<SaveIcon />}
              onClick={() => {
                // Strip internal fields (e.g., __cfgIdx) before writing HSF
                const cleaned: HsfRule[] = mergedRules.map((r: HsfRule & { __cfgIdx?: number }) => {
                  const { __cfgIdx, ...rest } = r
                  return rest as HsfRule
                })
                const file: HsfFile = { Rules: cleaned }
                const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
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
                    const text = JSON.stringify(customCfgs[idx], null, 2)
                    const ok = await writeClipboard(text)
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
              Configs: {restoreDraft?.Configs?.length ?? 0} • Metasets: {restoreDraft?.Metasets?.length ?? 0}
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
                if (Array.isArray(restoreDraft.Configs)) setCustomCfgs(restoreDraft.Configs.map(normalizeConfig))
                setIncludeAllExplicitMeta(Boolean(restoreDraft.IncludeAllExplicitMeta))
                const len = restoreDraft.Configs?.length ?? 0
                if (len > 0) {
                  const savedSel = typeof restoreDraft.SelectedConfigIndex === 'number' ? restoreDraft.SelectedConfigIndex : (len - 1)
                  const sel = savedSel >= 0 && savedSel < len ? savedSel : len - 1
                  setSelectedCfgIdx(sel)
                  try {
                    const cfgs = (restoreDraft.Configs || []).map(normalizeConfig)
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
              const key = `${row.id}:${row.isFlat ? 1 : 0}`
              const fg = (substatColors[key]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG[row.id] ?? '#90CAF9') as string
              const bg = (substatColors[key]?.bg ?? DEFAULT_SUBSTAT_COLORS_BG[row.id] ?? '#E3F2FD') as string
              return (
                <Box key={`row-${key}`} sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ minWidth: 120 }}>{row.label}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                    <ColorField value={fg} onChange={(v) => setSubstatColors(prev => ({ ...prev, [key]: { fg: v, bg } }))} label="Text" />
                    <ColorField value={bg} onChange={(v) => setSubstatColors(prev => ({ ...prev, [key]: { fg, bg: v } }))} label="Bg" />
                    <MuiChip size="small" label={row.label} variant="outlined" sx={{ height: 18, borderColor: fg, color: fg, bgcolor: bg, '& .MuiChip-label': { px: 0.75, py: 0, fontSize: 11 } }} />
                  </Box>
                </Box>
              )
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button size="small" variant="outlined" color="error" onClick={() => setSubstatColors(defaultSubstatColorMapV3())}>Reset to defaults</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setColorsDlgOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}
