import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { APP_VERSION } from './version'
import { parseHsfFile } from './lib/hsf'
import { formatArtifactTypes, rarityCodeToName, statNameFromId, statIsAny, statNameSort, formatRank, formatLevel, formatArtifactSets, formatMainStat, rankCodes, rarityCodes, rarityCodesFriendly, artifactTypeNames, artifactSetNames, factionCodeToName } from './lib/types'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { buildHsfRules, mainStatOptions, substatOptions, LEVELS, type BuilderConfig, defaultMinima, type MinimaTable } from './lib/hsfBuilder'
import { findObsoleteRules } from './lib/hsfObsolete'
import { type Metaset, defaultMetasets, resolveMetasetIds } from './lib/metasets'

// Normalize legacy HSFR configs to current BuilderConfig
function normalizeConfig(input: any): BuilderConfig {
  const legacyRank = input.rank
  let rankCode: number = typeof input.rankCode === 'number' ? input.rankCode : 0
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

  const legacyRarity = input.rarityExact
  let rarityCode: number = typeof input.rarityCode === 'number' ? input.rarityCode : 0
  if (rarityCode === 0 && typeof legacyRarity === 'string') {
    const map: Record<string, number> = {
      Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Mythical: 15,
    }
    rarityCode = map[legacyRarity] ?? 0
  }

  const mainStat = input.mainStat && typeof input.mainStat === 'object' ? input.mainStat : { any: true }
  const mainStatsArr: Array<{ id: number; f?: number }> = Array.isArray(input.mainStats)
    ? input.mainStats.map((m: any) => ({ id: Number(m.id), f: m.f !== undefined ? Number(m.f) : undefined }))
    : (mainStat.any ? [] : [{ id: Number(mainStat.id), f: mainStat.f !== undefined ? Number(mainStat.f) : undefined }])
  // Determine roll mode first (used to normalize startLevel)
  const rollMode: BuilderConfig['rollMode'] = (() => {
    const m = input.rollMode
    if (m === 'off' || m === 'strict' || m === 'potential' || m === 'auto') return m
    if (input.generateRollPermutations === false) return 'off'
    if (input.potentialKeep === true) return 'potential'
    if (input.generateRollPermutations === true) return 'strict'
    return 'potential'
  })()

  // Normalize start level; allow 'any' only if rollMode is 'off'
  const startLevel: BuilderConfig['startLevel'] = ((): any => {
    if (rollMode === 'off' && String(input.startLevel) === 'any') return 'any'
    return [0,4,8,12,16].includes(input.startLevel) ? input.startLevel : 0
  })()

  const normalized: BuilderConfig = {
    name: typeof input.name === 'string' ? input.name : '',
    keep: Boolean(input.keep ?? true),
    enabled: input.enabled !== false,
    rankCode,
    rarityCode,
    factionCode: typeof input.factionCode === 'number' ? input.factionCode : 0,
    mainStats: mainStatsArr,
    startLevel,
    rollBaseline: input.rollBaseline === 'upToLevel' ? 'upToLevel' : 'afterStart',
    rollMode,
    substats: Array.isArray(input.substats) ? input.substats.map((s: any) => ({ id: Number(s.id), isFlat: Boolean(s.isFlat) })) : [],
    fixedSubstats: Array.isArray(input.fixedSubstats) ? input.fixedSubstats.map((s: any) => ({ id: Number(s.id), isFlat: Boolean(s.isFlat) })) : [],
    minCount: ([0,1,2,3,4] as const).includes(input.minCount) ? input.minCount : 0,
    autoMinCount: Boolean(input.autoMinCount ?? false),
    artifactTypes: Array.isArray(input.artifactTypes) ? input.artifactTypes.map((x: any) => Number(x)) : undefined,
    artifactSets: Array.isArray(input.artifactSets) ? input.artifactSets.map((x: any) => Number(x)) : undefined,
    artifactMetaSets: Array.isArray(input.artifactMetaSets) ? input.artifactMetaSets.map((x: any) => String(x)) : undefined,
    substatRollBounds: (() => {
      const src = input.substatRollBounds
      if (!src || typeof src !== 'object') return undefined
      const out: Record<string, { min?: number; max?: number; any?: boolean }> = {}
      for (const [k, v] of Object.entries(src)) {
        if (!v || typeof v !== 'object') continue
        const min = (v as any).min
        const max = (v as any).max
        const any = Boolean((v as any).any)
        const mv: { min?: number; max?: number; any?: boolean } = {}
        if (typeof min === 'number' && min >= 0) mv.min = Math.min(5, Math.floor(min))
        if (typeof max === 'number' && max >= 0) mv.max = Math.min(5, Math.floor(max))
        if (any) mv.any = true
        // Keep entries that specify min/max or explicitly request wildcard (any)
        if (mv.min !== undefined || mv.max !== undefined || mv.any) out[k] = mv
      }
      return Object.keys(out).length ? out : undefined
    })(),
  }
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
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ b) & 0xFF]
  }
  crc = (crc ^ -1) >>> 0
  return crc.toString(16).padStart(8, '0').toUpperCase()
}

import {
    Box,
    Button,
    Container,
    Divider,
    Paper,
    Stack,
    Typography,
    TextField,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
  TableContainer,
  Chip,
  FormControl,
  FormLabel,
  FormControlLabel,
  Switch,
  Checkbox,
  Select,
  MenuItem,
  Menu,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ListSubheader,
  GlobalStyles,
  Popover,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import { Chip as MuiChip, IconButton, Tooltip, ToggleButton, ToggleButtonGroup, TextField as MuiTextField } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import DownloadIcon from '@mui/icons-material/Download'
import SaveIcon from '@mui/icons-material/Save'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { Snackbar, Alert } from '@mui/material'
import GavelIcon from '@mui/icons-material/Gavel'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import ShieldIcon from '@mui/icons-material/Shield'
import BackHandIcon from '@mui/icons-material/BackHand'
import CheckroomIcon from '@mui/icons-material/Checkroom'
import HikingIcon from '@mui/icons-material/Hiking'
import DiamondIcon from '@mui/icons-material/Diamond'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import FlagIcon from '@mui/icons-material/Flag'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'

function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
  const [hex, setHex] = React.useState(value)
  React.useEffect(() => setHex(value), [value])
  const open = Boolean(anchorEl)
  const preset = ['#90CAF9','#4FC3F7','#81C784','#66BB6A','#E57373','#FFB74D','#CE93D8','#B0BEC5','#FFD54F','#A5D6A7','#80CBC4','#F48FB1']
  const commit = (v: string) => {
    const vv = v.startsWith('#') ? v : `#${v}`
    if (/^#([0-9a-fA-F]{6})$/.test(vv)) onChange(vv)
  }
  return (
    <>
      <Button size="small" variant="outlined" onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ minWidth: 0, px: 1, py: 0.25, borderColor: value, color: value, bgcolor: '#0000' }}>
        <Box sx={{ width: 16, height: 16, borderRadius: 0.5, bgcolor: value, border: '1px solid', borderColor: 'divider', mr: 0.75 }} />
        {label}
      </Button>
      <Popover open={open} onClose={() => setAnchorEl(null)} anchorEl={anchorEl} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, width: 260 }}>
          <Typography variant="caption" sx={{ display: 'block', mb: 0.75 }}>Pick color</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.5 }}>
            {preset.map((c) => (
              <Box key={c} onClick={() => { commit(c); setAnchorEl(null) }} sx={{ width: 28, height: 24, borderRadius: 0.5, bgcolor: c, border: '1px solid', borderColor: 'divider', cursor: 'pointer' }} />
            ))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <MuiTextField size="small" label="#RRGGBB" value={hex} onChange={(e) => setHex(e.target.value)} onBlur={() => commit(hex)} sx={{ flex: 1 }} />
            <Button size="small" variant="contained" onClick={() => { commit(hex); setAnchorEl(null) }}>OK</Button>
          </Box>
        </Box>
      </Popover>
    </>
  )
}

export default function App() {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  const [customCfgs, setCustomCfgs] = useState<BuilderConfig[]>([])
  const AUTOSAVE_KEY = 'autosave.hsfr.v1'
  const [restoreDlgOpen, setRestoreDlgOpen] = useState(false)
  const [restoreDraft, setRestoreDraft] = useState<null | { Version?: string; Metasets?: Metaset[]; Minima?: MinimaTable; Configs?: BuilderConfig[]; IncludeAllExplicitMeta?: boolean }>(null)
  const [autosaveReady, setAutosaveReady] = useState(false)
  const loadedAutosaveRef = useRef<null | { Version?: string; Metasets?: Metaset[]; Minima?: MinimaTable; Configs?: BuilderConfig[]; IncludeAllExplicitMeta?: boolean }>(null)
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
    1: '#8BC34A', // HP% lime green (percent)
    2: '#FF7043', // ATK% orange/red (percent)
    3: '#64B5F6', // DEF% light blue (percent)
    4: '#BA68C8', // SPD purple
    5: '#FFD54F', // RES yellow
    6: '#2979FF', // ACC deep blue (distinct from DEF)
    7: '#00E5FF', // CR% vivid aqua (distinct from ACC/DEF)
    8: '#FF80AB', // CDMG% bright pink for readability
  }
  const DEFAULT_SUBSTAT_COLORS_BG: Record<number, string> = {
    1: '#1E2E14', // HP% dark lime tint
    2: '#2F1A14', // ATK% dark orange/red tint
    3: '#0F2234', // DEF% dark blue tint
    4: '#2A1C2F', // SPD dark purple tint
    5: '#3A2F15', // RES dark yellow/brown tint
    6: '#0A1E40', // ACC dark navy tint
    7: '#062833', // CR% dark aqua/teal tint
    8: '#2A0F1E', // CDMG% dark magenta/red wine tint (higher contrast)
  }
  const defaultSubstatColorMap = (): Record<number, { fg: string; bg: string }> => ({
    1: { fg: DEFAULT_SUBSTAT_COLORS_FG[1], bg: DEFAULT_SUBSTAT_COLORS_BG[1] },
    2: { fg: DEFAULT_SUBSTAT_COLORS_FG[2], bg: DEFAULT_SUBSTAT_COLORS_BG[2] },
    3: { fg: DEFAULT_SUBSTAT_COLORS_FG[3], bg: DEFAULT_SUBSTAT_COLORS_BG[3] },
    4: { fg: DEFAULT_SUBSTAT_COLORS_FG[4], bg: DEFAULT_SUBSTAT_COLORS_BG[4] },
    5: { fg: DEFAULT_SUBSTAT_COLORS_FG[5], bg: DEFAULT_SUBSTAT_COLORS_BG[5] },
    6: { fg: DEFAULT_SUBSTAT_COLORS_FG[6], bg: DEFAULT_SUBSTAT_COLORS_BG[6] },
    7: { fg: DEFAULT_SUBSTAT_COLORS_FG[7], bg: DEFAULT_SUBSTAT_COLORS_BG[7] },
    8: { fg: DEFAULT_SUBSTAT_COLORS_FG[8], bg: DEFAULT_SUBSTAT_COLORS_BG[8] },
  })
  const COLORS_STORAGE_KEY_V4 = 'substatColors.v4'
  const COLORS_STORAGE_KEY_V3 = 'substatColors.v3'
  const COLORS_STORAGE_KEY_V2 = 'substatColors.v2'
  const COLORS_STORAGE_KEY_V1 = 'substatColors.v1'
  const defaultSubstatColorMapV3 = (): Record<string, { fg: string; bg: string }> => {
    const base: Record<string, { fg: string; bg: string }> = {}
    for (const id of [1,2,3,4,5,6,7,8]) {
      base[`${id}:1`] = { fg: DEFAULT_SUBSTAT_COLORS_FG[id], bg: DEFAULT_SUBSTAT_COLORS_BG[id] } // flat
      base[`${id}:0`] = { fg: DEFAULT_SUBSTAT_COLORS_FG[id], bg: DEFAULT_SUBSTAT_COLORS_BG[id] } // percent
    }
    // Distinguish % vs flat for HP/ATK/DEF: flat slightly darker than %
    // HP
    base['1:0'] = { fg: '#8BC34A', bg: '#1E2E14' } // HP%
    base['1:1'] = { fg: '#689F38', bg: '#16250F' } // HP flat darker
    // ATK
    base['2:0'] = { fg: '#FF7043', bg: '#2F1A14' } // ATK%
    base['2:1'] = { fg: '#E64A19', bg: '#27140F' } // ATK flat darker
    // DEF
    base['3:0'] = { fg: '#64B5F6', bg: '#0F2234' } // DEF%
    base['3:1'] = { fg: '#42A5F5', bg: '#0C1C2C' } // DEF flat darker
    // SPD
    base['4:0'] = { fg: '#BA68C8', bg: '#2A1C2F' }
    base['4:1'] = { fg: '#BA68C8', bg: '#2A1C2F' }
    // RES
    base['5:0'] = { fg: '#FFD54F', bg: '#3A2F15' }
    base['5:1'] = { fg: '#FFD54F', bg: '#3A2F15' }
    // ACC (deep blue)
    base['6:0'] = { fg: '#2979FF', bg: '#0A1E40' }
    base['6:1'] = { fg: '#2979FF', bg: '#0A1E40' }
    // CR% (vivid aqua)
    base['7:0'] = { fg: '#00E5FF', bg: '#062833' }
    base['7:1'] = { fg: '#00E5FF', bg: '#062833' }
    // CDMG% (bright pink)
    base['8:0'] = { fg: '#FF80AB', bg: '#2A0F1E' }
    base['8:1'] = { fg: '#FF80AB', bg: '#2A0F1E' }
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
            base[`${id}:1`] = { fg: (v as any).fg, bg: (v as any).bg }
            base[`${id}:0`] = { fg: (v as any).fg, bg: (v as any).bg }
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
            base[`${id}:1`] = { fg: String(v), bg: DEFAULT_SUBSTAT_COLORS_BG[id] || base[`${id}:1`]?.bg }
            base[`${id}:0`] = { fg: String(v), bg: DEFAULT_SUBSTAT_COLORS_BG[id] || base[`${id}:0`]?.bg }
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
    startLevel: 0,
    rollBaseline: 'afterStart',
    rollMode: 'auto',
    substats: [],
    fixedSubstats: [],
    minCount: 0,
    autoMinCount: true,
  })
  // removed preview-generated rule count state for a cleaner UI
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
      const parsed: any = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeConfig)
      }
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.Configs)) return parsed.Configs.map(normalizeConfig)
        return [normalizeConfig(parsed)]
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
        return
      }
    }
    // Fallback: open manual dialog and target insertion after idx
    setSelectedCfgIdx(idx)
    setPasteText('')
    setPasteErr(null)
    setPasteDlgOpen(true)
  }

  const mergedRules = useMemo(() => {
    const base = hsf?.Rules ?? []
    // Build an effective metaset list that optionally includes a synthetic
    // "All (Explicit)" metaset that expands to all known sets.
    const ALL_META_ID = 'meta__ALL_EXPLICIT'
    const allSets: number[] = Object.keys(artifactSetNames).map(Number)
    const metasetsEffective: Metaset[] = includeAllExplicitMeta
      ? [{ id: ALL_META_ID, name: 'All (Explicit)', sets: allSets }, ...metasets]
      : metasets

    const customs = customCfgs
      .map((c, cfgIdx) => {
        const fromMetas = resolveMetasetIds(c.artifactMetaSets, metasetsEffective)
        const explicit = c.artifactSets ?? []
        const union = Array.from(new Set<number>([...explicit, ...fromMetas]))
        return { cfgIdx, cfg: { ...c, artifactSets: union } }
      })
      .flatMap(({ cfgIdx, cfg }) => buildHsfRules(cfg, minima).map(r => ({ ...r, __cfgIdx: cfgIdx } as any)))

    // Build and then remove obsolete rules that originate from custom configs
    const merged = base.concat(customs)
    const { obsolete } = findObsoleteRules(merged)
    if (obsolete.length === 0) return merged
    const obsoleteIdx = new Set(obsolete.map(o => o.index))
    // Only drop obsolete rules that came from customs; keep base as-is
    const filtered = merged.filter((r: any, idx) => !(obsoleteIdx.has(idx) && r.__cfgIdx !== undefined))
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
          const cfgs = Array.isArray((data as any).Configs) ? (data as any).Configs.map(normalizeConfig) : []
          // If autosaved content is essentially the same as initial defaults, skip dialog
          const savedMetasets = Array.isArray((data as any).Metasets) ? (data as any).Metasets as Metaset[] : undefined
          const savedMinima = (data as any).Minima
          const savedIncludeAll = Boolean((data as any).IncludeAllExplicitMeta)
          const normMetas = (mets?: Metaset[]) => {
            if (!mets) return '[]'
            const copy = mets.map(m => ({ id: m.id, name: m.name, sets: [...(m.sets ?? [])].sort((a,b)=>a-b) }))
            copy.sort((a,b) => String(a.id).localeCompare(String(b.id)))
            return JSON.stringify(copy)
          }
          const canonicalize = (x: any): any => {
            if (Array.isArray(x)) return x.map(canonicalize)
            if (x && typeof x === 'object') {
              const keys = Object.keys(x).sort()
              const out: any = {}
              for (const k of keys) out[k] = canonicalize(x[k])
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
            Version: (data as any).Version,
            Metasets: Array.isArray((data as any).Metasets) ? (data as any).Metasets : undefined,
            Minima: (data as any).Minima && typeof (data as any).Minima === 'object' ? (data as any).Minima as MinimaTable : undefined,
            Configs: cfgs,
            IncludeAllExplicitMeta: Boolean((data as any).IncludeAllExplicitMeta),
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
      }
      const curStr = JSON.stringify(cur)
      const baseStr = JSON.stringify(loadedAutosaveRef.current)
      if (curStr !== baseStr) setAutosaveReady(true)
    } catch {}
  }, [APP_VERSION, metasets, minima, customCfgs, includeAllExplicitMeta, autosaveReady])

  // Build autosave payload and keep a ref for synchronous flush on unload
  const autosavePayload = useMemo(() => ({
    Version: APP_VERSION,
    Metasets: metasets,
    Minima: minima,
    Configs: customCfgs,
    IncludeAllExplicitMeta: includeAllExplicitMeta,
  }), [APP_VERSION, metasets, minima, customCfgs, includeAllExplicitMeta])
  const autosaveRef = useRef<{ crc: string; payload: any } | null>(null)
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
    const t = setTimeout(() => {
      try { (copyInputRef.current as any)?.select?.() } catch {}
    }, 0)
    return () => clearTimeout(t)
  }, [copyDlgOpen])
  useLayoutEffect(() => {
    if (!autosaveReady) return
    try {
      const dataStr = JSON.stringify(autosavePayload)
      const crc = crc32Hex(dataStr)
      autosaveRef.current = { crc, payload: autosavePayload }
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify([crc, autosavePayload]))
    } catch {}
  }, [autosavePayload, autosaveReady])
  useEffect(() => {
    const flush = () => {
      try {
        if (!autosaveReady) return
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
          ctx.fillStyle = colors[i++]
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
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25, flex: 1, '& *': { fontSize: 10, lineHeight: 1.15, textAlign: 'right' } }}>
            <Typography variant="caption" color="text.secondary">
              v{APP_VERSION} — Build and preview sell files for RSL Helper. Made by [STBL] Nusi㊷
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0 }}>
              Unofficial, fan-made tool — not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0 }}>
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
                      const parsed = JSON.parse(String(reader.result))
                      const rawCfgs: any[] = Array.isArray(parsed) ? parsed : parsed.Configs ?? []
                      const nextCfgs = rawCfgs.map(normalizeConfig)
                      const nextMetas = (!Array.isArray(parsed) && Array.isArray(parsed?.Metasets)) ? parsed.Metasets : metasets
                      const nextMinima = (!Array.isArray(parsed) && parsed?.Minima) ? parsed.Minima : minima
                      const nextAllExplicit = (!Array.isArray(parsed) && typeof parsed?.IncludeAllExplicitMeta === 'boolean') ? parsed.IncludeAllExplicitMeta : includeAllExplicitMeta
                      setCustomCfgs(nextCfgs)
                      if (nextMetas !== metasets) setMetasets(nextMetas)
                      if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
                      if (nextAllExplicit !== includeAllExplicitMeta) setIncludeAllExplicitMeta(nextAllExplicit)
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
                    const parsed = JSON.parse(String(reader.result))
                    const rawCfgs: any[] = Array.isArray(parsed) ? parsed : parsed.Configs ?? []
                    const nextCfgs = rawCfgs.map(normalizeConfig)
                    const nextMetas = (!Array.isArray(parsed) && Array.isArray(parsed?.Metasets)) ? parsed.Metasets : metasets
                    const nextMinima = (!Array.isArray(parsed) && parsed?.Minima) ? parsed.Minima : minima
                    const nextAllExplicit = (!Array.isArray(parsed) && typeof parsed?.IncludeAllExplicitMeta === 'boolean') ? parsed.IncludeAllExplicitMeta : includeAllExplicitMeta
                    setCustomCfgs(nextCfgs)
                    if (nextMetas !== metasets) setMetasets(nextMetas)
                    if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
                    if (nextAllExplicit !== includeAllExplicitMeta) setIncludeAllExplicitMeta(nextAllExplicit)
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
                const blob = new Blob([JSON.stringify({ Version: APP_VERSION, Metasets: metasets, Minima: minima, Configs: customCfgs, IncludeAllExplicitMeta: includeAllExplicitMeta }, null, 2)], { type: 'application/json' })
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
                  onSelect={() => { setSelectedCfgIdx(idx); setBuilder(c) }}
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
                    const tmp = arr[idx-1]; arr[idx-1] = arr[idx]; arr[idx] = tmp
                    // update selection if affected
                    setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx - 1 : sel === idx - 1 ? idx : sel)
                    return arr
                  })}
                  onMoveDown={() => setCustomCfgs(prev => {
                    if (idx === prev.length - 1) return prev
                    const arr = [...prev]
                    const tmp = arr[idx+1]; arr[idx+1] = arr[idx]; arr[idx] = tmp
                    setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx + 1 : sel === idx + 1 ? idx : sel)
                    return arr
                  })}
                  onMoveTop={() => setCustomCfgs(prev => {
                    if (idx === 0) return prev
                    const arr = [...prev]
                    const [m] = arr.splice(idx, 1)
                    arr.unshift(m)
                    setSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? 0 : (sel < idx ? sel : sel)))
                    return arr
                  })}
                  onMoveBottom={() => setCustomCfgs(prev => {
                    if (idx === prev.length - 1) return prev
                    const arr = [...prev]
                    const [m] = arr.splice(idx, 1)
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
            anchorPosition={chipAreaMenu?.open ? { top: chipAreaMenu.y, left: chipAreaMenu.x } : undefined}
          >
            <MenuItem
              onClick={async () => {
                const hsfr = { Version: APP_VERSION, Metasets: metasets, Minima: minima, Configs: customCfgs, IncludeAllExplicitMeta: includeAllExplicitMeta }
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
                    if (preLen === 0) {
                      try { setSelectedCfgIdx(cfgs.length - 1) } catch {}
                    }
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
                // Detect if we should select the last created (first paste into empty list)
                const preLen = customCfgs.length
                const parsed = parseConfigsFromText(pasteText)
                const ok = handlePasteText(pasteText)
                if (ok) {
                  if (pasteSelectOnEmpty && preLen === 0 && parsed.length > 0) {
                    try { setSelectedCfgIdx(parsed.length - 1) } catch {}
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
                const file: HsfFile = { Rules: mergedRules }
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
            <HsfRulesTable
              rules={mergedRules}
              hoveredCfgIdx={hoveredCfgIdx}
              setHoveredCfgIdx={setHoveredCfgIdx}
              selectedCfgIdx={selectedCfgIdx}
              onSelectCfgIdx={(idx) => { setSelectedCfgIdx(idx); setBuilder(customCfgs[idx]) }}
              onConfigAction={async (idx, action) => {
                if (action === 'duplicate') {
                  setCustomCfgs(prev => {
                    const copy = { ...prev[idx] }
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
                    const [m] = arr.splice(idx, 1)
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
                    const [m] = arr.splice(idx, 1)
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
                    const tmp = arr[idx-1]; arr[idx-1] = arr[idx]; arr[idx] = tmp
                    setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx - 1 : sel === idx - 1 ? idx : sel)
                    return arr
                  })
                  return
                }
                if (action === 'move_down') {
                  setCustomCfgs(prev => {
                    if (idx === prev.length - 1) return prev
                    const arr = [...prev]
                    const tmp = arr[idx+1]; arr[idx+1] = arr[idx]; arr[idx] = tmp
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
          <Button color="error" onClick={() => { setRestoreDlgOpen(false); /* wait for user change before enabling autosave */ }}>Dismiss</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (restoreDraft) {
                if (Array.isArray(restoreDraft.Metasets)) setMetasets(restoreDraft.Metasets)
                if (restoreDraft.Minima && typeof restoreDraft.Minima === 'object') setMinima(restoreDraft.Minima)
                if (Array.isArray(restoreDraft.Configs)) setCustomCfgs(restoreDraft.Configs.map(normalizeConfig))
                setIncludeAllExplicitMeta(Boolean(restoreDraft.IncludeAllExplicitMeta))
                setSelectedCfgIdx((restoreDraft.Configs?.length ?? 0) ? 0 : null)
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
              { id: 1, isFlat: true, label: 'HP' },
              { id: 1, isFlat: false, label: 'HP%' },
              { id: 2, isFlat: true, label: 'ATK' },
              { id: 2, isFlat: false, label: 'ATK%' },
              { id: 3, isFlat: true, label: 'DEF' },
              { id: 3, isFlat: false, label: 'DEF%' },
              { id: 4, isFlat: true, label: 'SPD' },
              { id: 5, isFlat: true, label: 'RES' },
              { id: 6, isFlat: true, label: 'ACC' },
              { id: 7, isFlat: false, label: 'CR%' },
              { id: 8, isFlat: false, label: 'CDMG%' },
            ].map((row) => {
              const key = `${row.id}:${row.isFlat ? 1 : 0}`
              const fg = substatColors[key]?.fg || DEFAULT_SUBSTAT_COLORS_FG[row.id]
              const bg = substatColors[key]?.bg || DEFAULT_SUBSTAT_COLORS_BG[row.id]
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

function ConfirmDialogs({
  openClear,
  setOpenClear,
  onConfirmClear,
  deleteIdx,
  setDeleteIdx,
  onConfirmDelete,
}: {
  openClear: boolean
  setOpenClear: (v: boolean) => void
  onConfirmClear: () => void
  deleteIdx: number | null
  setDeleteIdx: (v: number | null) => void
  onConfirmDelete: () => void
}) {
  return (
    <>
      <Dialog open={openClear} onClose={() => setOpenClear(false)}>
        <DialogTitle>Delete all configs?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">This will delete all custom rule configurations (HSFR). This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenClear(false)}>Cancel</Button>
          <Button color="error" onClick={() => { setOpenClear(false); onConfirmClear() }}>Delete all</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteIdx !== null} onClose={() => setDeleteIdx(null)}>
        <DialogTitle>Delete this configuration?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">This will remove the selected configuration from HSFR.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteIdx(null)}>Cancel</Button>
          <Button color="error" onClick={() => { setDeleteIdx(null); onConfirmDelete() }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function HsfRulesTable({ rules, hoveredCfgIdx, setHoveredCfgIdx, selectedCfgIdx, onSelectCfgIdx, onConfigAction, onClearBase, substatColors }: {
  rules: HsfRule[];
  hoveredCfgIdx: number | null;
  setHoveredCfgIdx: (v: number | null) => void;
  selectedCfgIdx: number | null;
  onSelectCfgIdx: (idx: number) => void;
  onConfigAction: (idx: number, action: 'duplicate' | 'delete' | 'move_up' | 'move_down' | 'move_top' | 'move_bottom' | 'copy' | 'paste_after') => void;
  onClearBase: () => void;
  substatColors: Record<string, { fg: string; bg: string }>;
}) {
  const [isHovering, setIsHovering] = useState(false)
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; cfgIdx?: number; rule?: HsfRule } | null>(null)
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const [containerW, setContainerW] = useState(0)
  // Variable-height virtualization support when wrapping is enabled
  const rowHeightsRef = React.useRef<number[]>([])
  const [heightsVersion, setHeightsVersion] = useState(0)
  const prefixHeightsRef = React.useRef<number[]>([])
  const totalHeightRef = React.useRef<number>(0)
  const anchorIndexRef = React.useRef<number | null>(null)
  const pendingRestoreRef = React.useRef(false)

  // Suppress native browser context menu while an app menu is open (table menus)
  useEffect(() => {
    const anyOpen = Boolean(menu?.open)
    if (!anyOpen) return
    const handler = (e: MouseEvent) => { e.preventDefault() }
    window.addEventListener('contextmenu', handler)
    return () => { window.removeEventListener('contextmenu', handler) }
  }, [menu?.open])

  

  type ColKey = keyof HsfRule | 'Idx' | 'CfgIdx' | 'SubstatsSummary' | 'ArtifactTypeNames' | 'ArtifactSetNames' | 'RarityNames' | 'MainStatName' | 'RankLabel' | 'LevelLabel'
  type ColMode = 'auto' | 'show' | 'hide'
  // Columns support Show/Hide; Faction additionally supports Auto (tri-state)
  type ColCfg = { key: ColKey; label: string; width: number; visible: boolean; mode?: ColMode }
  const defaultCols: ColCfg[] = [
    { key: 'Idx', label: 'Idx', width: 72, visible: true },
    { key: 'CfgIdx', label: 'Cfg', width: 64, visible: true },
    { key: 'Keep', label: 'Keep', width: 64, visible: false },
    { key: 'Use', label: 'Use', width: 56, visible: false },
    { key: 'ArtifactSetNames', label: 'Sets', width: 170, visible: true },
    { key: 'ArtifactTypeNames', label: 'Slot', width: 100, visible: true },
    { key: 'RankLabel', label: 'Rank', width: 65, visible: true },
    { key: 'RarityNames', label: 'Rarity', width: 110, visible: true },
    { key: 'MainStatName', label: 'Main', width: 75, visible: true },
    { key: 'LevelLabel', label: 'Level', width: 75, visible: true },
    { key: 'Faction', label: 'Faction', width: 70, visible: false, mode: 'auto' },
    { key: 'SubstatsSummary', label: 'Sub', width: 282, visible: true },
  ]
  const STORAGE_KEY = 'rulesTableCols.v2'
  const WRAP_ROWS_KEY = 'rulesTableWrapRows.v1'
  const [cols, setCols] = useState<ColCfg[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return defaultCols
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return defaultCols
      // Merge with defaults to include new columns
      const map = new Map<string, ColCfg>()
      for (const d of defaultCols) map.set(String(d.key), d)
      const restored: ColCfg[] = []
      for (const c of parsed) {
        const base = map.get(String((c as any).key))
        if (base) restored.push({
          ...base,
          width: Number((c as any).width) || base.width,
          visible: Boolean((c as any).visible),
          mode: (c as any).mode ?? base.mode,
        })
      }
      // Append any missing defaults
      for (const d of defaultCols) if (!restored.find(x => x.key === d.key)) restored.push(d)
      return restored
    } catch { return defaultCols }
  })
  React.useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cols)) } catch {}
  }, [cols])

  // Effective visibility helper (handles Faction's Auto mode)
  const anyCustomWithFaction = useMemo(() => rules.some((r: any) => r && r.__cfgIdx !== undefined && typeof r.Faction === 'number' && r.Faction !== 0), [rules])
  const isColVisible = React.useCallback((c: ColCfg) => {
    if (c.key === 'Faction') {
      const m = c.mode ?? 'auto'
      if (m === 'show') return true
      if (m === 'hide') return false
      return anyCustomWithFaction
    }
    return c.visible
  }, [anyCustomWithFaction])

  // Auto-show rarely used columns when needed and still in default mode.
  // (Faction auto visibility is handled via isColVisible based on its 'mode')

  // Row wrap toggle (persisted)
  const [wrapRows, setWrapRows] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(WRAP_ROWS_KEY)
      if (raw === 'true') return true
      if (raw === 'false') return false
    } catch {}
    return false // default to single-line rows
  })
  React.useEffect(() => {
    try { localStorage.setItem(WRAP_ROWS_KEY, String(wrapRows)) } catch {}
  }, [wrapRows])

  // Recompute prefix sums when heights or rules length changes
  React.useEffect(() => {
    const n = rules.length
    if (rowHeightsRef.current.length !== n) {
      const fixed = 30
      rowHeightsRef.current = Array.from({ length: n }, () => fixed)
    }
    const pref: number[] = new Array(n)
    let acc = 0
    for (let i = 0; i < n; i++) { pref[i] = acc; acc += rowHeightsRef.current[i] || 28 }
    prefixHeightsRef.current = pref
    totalHeightRef.current = acc
  }, [heightsVersion, rules.length])

  // Track scroll and viewport height for virtualization
  React.useEffect(() => {
    const el = tableContainerRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    const measure = () => { setViewportH(el.clientHeight); setContainerW(el.clientWidth) }
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
    }
  }, [])

  // Column reordering via drag
  const [dragColIdx, setDragColIdx] = useState<number | null>(null)
  const onHeaderDragStart = (idx: number) => setDragColIdx(idx)
  const onHeaderDrop = (idx: number) => {
    if (dragColIdx === null || dragColIdx === idx) return
    setCols(prev => {
      const arr = [...prev]
      const [m] = arr.splice(dragColIdx, 1)
      arr.splice(idx, 0, m)
      return arr
    })
    setDragColIdx(null)
  }
  const onHeaderDragOver = (e: React.DragEvent) => { e.preventDefault() }

  // Column resize
  const startResize = (idx: number, startX: number) => {
    const startWidth = cols[idx].width
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX
      setCols(prev => prev.map((c,i) => i===idx ? { ...c, width: Math.max(40, startWidth + dx) } : c))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Column visibility menu (opened on header right-click)
  const [colsMenu, setColsMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  useEffect(() => {
    const anyOpen = Boolean(colsMenu?.open)
    if (!anyOpen) return
    const handler = (e: MouseEvent) => { e.preventDefault() }
    window.addEventListener('contextmenu', handler)
    return () => { window.removeEventListener('contextmenu', handler) }
  }, [colsMenu?.open])

  const summarizeSubstats = (s: HsfRule['Substats']) => {
    const nonAny = s?.filter(Boolean)?.filter(x => !statIsAny(x.ID)).sort(statNameSort);
    // Summary text: use standard operators (≥/≤)
    const cond = (c?: string) => c === '>=' ? '≥' : c === '<=' ? '≤' : (c ?? '')
    return nonAny?.map((x) => `${ x.Condition === '¬' ? x.Condition : '' }${ statNameFromId(x.ID, x.IsFlat) } ${ (!x.Condition || x.Condition === '¬') ? '' : cond(x.Condition) } ${ (x.Condition === '>=' || x.Condition === '<=') ? x.Value : '' }`.trim()).join(' ∧ ');
  }

  const renderSubstatsInline = (s: HsfRule['Substats']) => {
    const nonAny = s?.filter(Boolean)?.filter(x => !statIsAny(x.ID)).sort(statNameSort);
    // Chips: replace ">=" with a small dot to reduce clutter
    const cond = (c?: string) => c === '>=' ? '·' : c === '<=' ? '≤' : (c ?? '')
    const defaultFg: Record<number, string> = { 1: '#8BC34A', 2: '#FF7043', 3: '#64B5F6', 4: '#BA68C8', 5: '#FFD54F', 6: '#2979FF', 7: '#00E5FF', 8: '#FF80AB' }
    const defaultBg: Record<number, string> = { 1: '#1E2E14', 2: '#2F1A14', 3: '#0F2234', 4: '#2A1C2F', 5: '#3A2F15', 6: '#0A1E40', 7: '#062833', 8: '#2A0F1E' }
    if (!nonAny || nonAny.length === 0) return null
    return (
      <Box sx={{ display: 'inline-flex', gap: 0.25, alignItems: 'center', verticalAlign: 'middle', flexWrap: wrapRows ? 'wrap' : 'nowrap', maxWidth: '100%' }}>
        {nonAny.map((x, idx) => {
          const neg = x.Condition === '¬'
          const op = (!x.Condition || neg) ? '' : cond(x.Condition)
          const val = (x.Condition === '>=' || x.Condition === '<=') ? String(x.Value) : ''
          const name = statNameFromId(x.ID, x.IsFlat)
          const label = `${neg ? '¬' : ''}${name}${op}${val}`
          const variantKey = `${x.ID}:${x.IsFlat ? 1 : 0}`
          const fg = substatColors[variantKey]?.fg || defaultFg[x.ID] || '#90CAF9'
          const bg = substatColors[variantKey]?.bg || defaultBg[x.ID] || '#E3F2FD'
          return (
            <MuiChip
              key={`${x.ID}:${x.IsFlat ? 1 : 0}:${x.Condition ?? ''}:${x.Value ?? ''}:${idx}`}
              size="small"
              label={label}
              variant="outlined"
              sx={{
                height: 18,
                borderColor: fg,
                color: fg,
                bgcolor: bg,
                '& .MuiChip-label': { px: 0.75, py: 0, fontSize: 12, lineHeight: 1.15 },
              }}
            />
          )
        })}
      </Box>
    )
  }

  return (
    <Box onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => { setIsHovering(false); setHoveredCfgIdx(null) }} sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Menu
        open={Boolean(colsMenu?.open)}
        onClose={() => setColsMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={colsMenu?.open ? { top: colsMenu.y, left: colsMenu.x } : undefined}
      >
        <Box sx={{ px: 1.5, pt: 1, pb: 0.5, display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => { try { localStorage.removeItem(STORAGE_KEY) } catch {}; setCols(defaultCols); setColsMenu(null) }}
          >
            Reset columns
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              try {
                const container = tableContainerRef.current
                const available = container?.clientWidth || 1000
                const ctx = document.createElement('canvas').getContext('2d')
                const bodyFont = '12px ui-monospace, monospace'
                const normalFont = getComputedStyle(document.body).font || '12px sans-serif'
                const m = (text: string, mono = true) => {
                  if (!ctx) return text.length * 7
                  ctx.font = mono ? bodyFont : normalFont
                  return Math.ceil(ctx.measureText(String(text)).width)
                }
                const pad = 24 // left+right cell padding
                const maxRowsToCheck = Math.min(rules.length, 1000)
                const keys = cols.filter(c => isColVisible(c)).map(c => c.key)
                const widths = new Map<ColKey, number>()
                // header labels baseline
                for (const c of cols.filter(c => isColVisible(c))) {
                  widths.set(c.key, Math.max(40, m(c.label, true) + pad))
                }
                // data baseline
                for (let i = 0; i < maxRowsToCheck; i++) {
                  const r = rules[i]
                  const cfgIdx = (r as any).__cfgIdx as number | undefined
                  for (const k of keys) {
                    let text = ''
                    if (k === 'SubstatsSummary') text = summarizeSubstats(r.Substats) || ''
                    else if (k === 'CfgIdx') text = cfgIdx !== undefined ? String(cfgIdx + 1) : ''
                    else if (k === 'Keep') text = r.Keep ? 'Keep' : 'Sell'
                    else if (k === 'Use') text = r.Use ? '✓' : '-'
                    else if (k === 'ArtifactTypeNames') text = formatArtifactTypes(r.ArtifactType)
                    else if (k === 'ArtifactSetNames') text = formatArtifactSets(r.ArtifactSet)
                    else if (k === 'RankLabel') text = formatRank(r.Rank)
                    else if (k === 'RarityNames') text = rarityCodeToName(r.Rarity)
                    else if (k === 'Faction') text = factionCodeToName(r.Faction)
                    else if (k === 'MainStatName') text = formatMainStat(r.MainStatID, r.MainStatF)
                    else if (k === 'LevelLabel') text = formatLevel(r.LVLForCheck)
                    else if (k === 'Idx') text = String(i + 1)
                    else text = String((r as any)[k] ?? '')
                    const mono = k !== 'SubstatsSummary'
                    const w = (k === 'SubstatsSummary') ? Math.min(480, m(text, false) + pad) : m(text, mono) + pad
                    widths.set(k, Math.max(widths.get(k) || 0, Math.max(40, w)))
                  }
                }
                // Ensure Idx fits 5 digits and Cfg fits 3 digits
                const digitW = m('0'.repeat(5), true) + pad
                if (widths.has('Idx')) widths.set('Idx', Math.max(widths.get('Idx')!, digitW))
                const cfgDigitW = m('0'.repeat(3), true) + pad
                if (widths.has('CfgIdx')) widths.set('CfgIdx', Math.max(widths.get('CfgIdx')!, cfgDigitW))
                // If sum exceeds available, scale down proportionally but not below 40
                const visCols = cols.filter(c => isColVisible(c))
                const sum = visCols.reduce((acc, c) => acc + (widths.get(c.key) || c.width), 0)
                let scale = sum > available ? available / sum : 1
                if (!Number.isFinite(scale) || scale <= 0) scale = 1
                const next = cols.map(c => {
                  if (!isColVisible(c)) return c
                  const base = widths.get(c.key) || c.width
                  const w = Math.max(40, Math.floor(base * scale))
                  return { ...c, width: w }
                })
                setCols(next)
              } catch {}
              setColsMenu(null)
            }}
          >
            Auto-fit widths
          </Button>
        </Box>
        <MenuItem
          onClick={(e) => {
            e.stopPropagation()
            const nextWrap = !wrapRows
            if (nextWrap === wrapRows) return
            const fixedRowH = 30
            const container = tableContainerRef.current
            if (container) {
              let idx = 0
              if (!wrapRows) {
                idx = Math.max(0, Math.floor(container.scrollTop / fixedRowH))
              } else {
                const pref = prefixHeightsRef.current
                const lowerBound = (arr: number[], x: number) => {
                  let lo = 0, hi = arr.length - 1, ans = arr.length
                  while (lo <= hi) { const mid = (lo + hi) >>> 1; if (arr[mid] >= x) { ans = mid; hi = mid - 1 } else { lo = mid + 1 } }
                  return ans
                }
                idx = Math.max(0, Math.min(pref.length - 1, lowerBound(pref, container.scrollTop)))
              }
              anchorIndexRef.current = idx
              pendingRestoreRef.current = true
            }
            setWrapRows(nextWrap)
          }}
          sx={{ gap: 1 }}
        >
          <Typography variant="body2" sx={{ minWidth: 140 }}>Multi-line rows</Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={wrapRows ? 'on' : 'off'}
            onChange={(_, v) => {
              if (!v) return
              const nextWrap = v === 'on'
              if (nextWrap === wrapRows) return
              // Preserve top visible row index when toggling modes
              const fixedRowH = 30
              const container = tableContainerRef.current
              if (container) {
                let idx = 0
                if (!wrapRows) {
                  idx = Math.max(0, Math.floor(container.scrollTop / fixedRowH))
                } else {
                  const pref = prefixHeightsRef.current
                  const lowerBound = (arr: number[], x: number) => {
                    let lo = 0, hi = arr.length - 1, ans = arr.length
                    while (lo <= hi) { const mid = (lo + hi) >>> 1; if (arr[mid] >= x) { ans = mid; hi = mid - 1 } else { lo = mid + 1 } }
                    return ans
                  }
                  idx = Math.max(0, Math.min(pref.length - 1, lowerBound(pref, container.scrollTop)))
                }
                anchorIndexRef.current = idx
                pendingRestoreRef.current = true
              }
              setWrapRows(nextWrap)
            }}
          >
            <ToggleButton value="on">On</ToggleButton>
            <ToggleButton value="off">Off</ToggleButton>
          </ToggleButtonGroup>
        </MenuItem>
        <Divider />
        {cols.map((c, idx) => {
          const isFaction = c.key === 'Faction'
          const val = isFaction ? (c.mode ?? 'auto') : (c.visible ? 'show' : 'hide')
          return (
            <MenuItem
              key={String(c.key)}
              onClick={(e) => {
                e.stopPropagation()
                // Clicking the row toggles the selection:
                // - Non-faction: show <-> hide
                // - Faction: cycle auto -> show -> hide -> auto
                if (isFaction) {
                  const next = val === 'auto' ? 'show' : val === 'show' ? 'hide' : 'auto'
                  setCols(prev => prev.map((x, i) => (i === idx ? { ...x, mode: next as any } : x)))
                } else {
                  const next = val === 'show' ? 'hide' : 'show'
                  setCols(prev => prev.map((x, i) => (i === idx ? { ...x, visible: next === 'show' } : x)))
                }
              }}
              sx={{ gap: 1 }}
            >
              <Typography variant="body2" sx={{ minWidth: 140 }}>{c.label}</Typography>
              <ToggleButtonGroup exclusive size="small" value={val} onChange={(_, v) => {
                if (!v) return
                setCols(prev => prev.map((x,i) => {
                  if (i !== idx) return x
                  if (isFaction) return { ...x, mode: v as any }
                  return { ...x, visible: v === 'show' }
                }))
              }}>
                {isFaction ? (
                  <>
                    <ToggleButton value="auto">Auto</ToggleButton>
                    <ToggleButton value="show">Show</ToggleButton>
                    <ToggleButton value="hide">Hide</ToggleButton>
                  </>
                ) : (
                  <>
                    <ToggleButton value="show">Show</ToggleButton>
                    <ToggleButton value="hide">Hide</ToggleButton>
                  </>
                )}
              </ToggleButtonGroup>
            </MenuItem>
          )
        })}
      </Menu>
      {(() => {
        const visibleCols = cols.filter(c => isColVisible(c))
        const totalVisibleWidth = visibleCols.reduce((sum, c) => sum + (c.width || 0), 0)
        const needHScroll = totalVisibleWidth > containerW && containerW > 0
        return (
          <TableContainer
            ref={tableContainerRef}
            sx={{
              overflowY: 'auto',
              overflowX: needHScroll ? 'auto' : 'hidden',
              maxHeight: 960,
              '@media (min-width:2320px)': {
                flex: 1,
                minHeight: 0,
                maxHeight: '100%',
                height: '100%',
              },
            }}
          >
            <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHead>
              <TableRow>
                {cols.filter(c => isColVisible(c)).map((c) => {
                  const realIdx = cols.findIndex(x => x.key === c.key)
                  const width = c.width
                  return (
                  <TableCell
                    key={String(c.key)}
                    sx={{
                      fontWeight: 600,
                      fontSize: 13,
                      width,
                      userSelect: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    draggable
                    onDragStart={() => onHeaderDragStart(realIdx)}
                    onDragOver={onHeaderDragOver}
                    onDrop={() => onHeaderDrop(realIdx)}
                    title={`${c.label} — drag to reorder; drag handle at right edge to resize; right-click for options`}
                    onContextMenu={(e) => { e.preventDefault(); setColsMenu({ open: true, x: e.clientX, y: e.clientY }) }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                      <span>{c.label}</span>
                    </Box>
                    <Box
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startResize(realIdx, e.clientX) }}
                      sx={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 6, cursor: 'col-resize', zIndex: 2 }}
                    />
                  </TableCell>
                )})}
              </TableRow>
              </TableHead>
              <TableBody>
              {(() => {
                const visibleCols = cols.filter(c => isColVisible(c))
                const colSpan = Math.max(1, visibleCols.length)
                const fixedRowH = 30 // px; single-line dense height
                const overscan = 20
                let start = 0, end = rules.length, padTop = 0, padBottom = 0
                if (rules.length > 200) {
                  if (!wrapRows) {
                    start = Math.max(0, Math.floor(scrollTop / fixedRowH) - overscan)
                    const visibleCount = Math.ceil((viewportH || 1) / fixedRowH) + overscan * 2
                    end = Math.min(rules.length, start + visibleCount)
                    padTop = start * fixedRowH
                    padBottom = (rules.length - end) * fixedRowH
                  } else {
                    // Variable-height virtualization: use prefix sums to find range
                    const pref = prefixHeightsRef.current
                    const total = totalHeightRef.current
                    const viewBot = Math.min(total, scrollTop + (viewportH || 1))
                    const lowerBound = (arr: number[], x: number) => {
                      let lo = 0, hi = arr.length - 1, ans = arr.length
                      while (lo <= hi) {
                        const mid = (lo + hi) >>> 1
                        if (arr[mid] >= x) { ans = mid; hi = mid - 1 } else { lo = mid + 1 }
                      }
                      return ans
                    }
                    start = Math.max(0, lowerBound(pref, scrollTop) - overscan)
                    end = Math.min(rules.length, lowerBound(pref, viewBot) + overscan)
                    padTop = pref[start] || 0
                    const endOffset = pref[end] || total
                    padBottom = Math.max(0, total - endOffset)
                  }
                }
                const rows = rules.slice(start, end)
                const baseIndex = start
                const spacerSx = { p: 0, border: 0, height: 0 }
                return (
                  <>
                    {padTop > 0 && (
                      <TableRow key="spacer-top" sx={{ height: padTop }}>
                        <TableCell colSpan={colSpan} sx={spacerSx} />
                      </TableRow>
                    )}
                    {rows.map((r, i) => {
                      const realIndex = baseIndex + i
                      const cfgIdx = (r as any).__cfgIdx as number | undefined
                      const isHoverCfg = hoveredCfgIdx !== null && cfgIdx === hoveredCfgIdx
                      const isSelectedCfg = selectedCfgIdx !== null && cfgIdx === selectedCfgIdx
                      return (
                      <TableRow
                        key={realIndex}
                        hover
                        selected={isHoverCfg}
                        onMouseEnter={() => { if (isHovering) setHoveredCfgIdx(cfgIdx ?? null) }}
                        onMouseLeave={() => { if (isHovering) setHoveredCfgIdx(null) }}
                        data-cfg-idx={cfgIdx !== undefined ? String(cfgIdx) : undefined}
                        sx={(theme) => ({
                          backgroundColor: isSelectedCfg ? theme.palette.action.hover : undefined,
                          height: !wrapRows ? fixedRowH : undefined,
                          textDecoration: r.Use === false ? 'line-through' : 'none',
                        })}
                        onClick={() => { if (cfgIdx !== undefined) onSelectCfgIdx(cfgIdx) }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setMenu({ open: true, x: e.clientX - 2, y: e.clientY - 4, cfgIdx, rule: r })
                        }}
                        ref={(el) => {
                          if (!wrapRows) return
                          if (!el) return
                          const h = el.getBoundingClientRect().height
                          const arr = rowHeightsRef.current
                          if (arr[realIndex] !== h && Number.isFinite(h) && h > 0) {
                            arr[realIndex] = h
                            setHeightsVersion(v => v + 1)
                          }
                        }}
                      >
                        {cols.filter(c => isColVisible(c)).map((c) => {
                          let value: any
                          if (c.key === 'SubstatsSummary') value = summarizeSubstats(r.Substats)
                          else if (c.key === 'CfgIdx') value = (cfgIdx !== undefined) ? String(cfgIdx + 1) : ''
                          else if (c.key === 'Keep') value = r.Keep ? 'Keep' : 'Sell'
                          else if (c.key === 'Use') value = r.Use ? '✓' : '-'
                          else if (c.key === 'ArtifactTypeNames') value = formatArtifactTypes(r.ArtifactType)
                          else if (c.key === 'ArtifactSetNames') value = formatArtifactSets(r.ArtifactSet)
                          else if (c.key === 'RankLabel') value = formatRank(r.Rank)
                          else if (c.key === 'RarityNames') value = rarityCodeToName(r.Rarity)
                          else if (c.key === 'Faction') value = factionCodeToName(r.Faction)
                          else if (c.key === 'MainStatName') value = formatMainStat(r.MainStatID, r.MainStatF)
                          else if (c.key === 'LevelLabel') value = formatLevel(r.LVLForCheck)
                          else if (c.key === 'Idx') value = realIndex + 1
                          else value = (r as any)[c.key]

                          const text = Array.isArray(value) ? value.join(',') : String(value ?? '')
                          const isIdx = c.key === 'Idx'
                          const keep = Boolean(r.Keep)
                          const isSubstats = c.key === 'SubstatsSummary'
                          const content = isSubstats ? renderSubstatsInline(r.Substats) : text
                          const cellInner = (!wrapRows && String(text).length)
                            ? (
                                <Tooltip title={isSubstats ? summarizeSubstats(r.Substats) : text} enterDelay={500}>
                                  <span>{content}</span>
                                </Tooltip>
                              )
                            : content
                          return (
                            <TableCell
                              key={String(c.key)}
                              sx={{
                                fontFamily: isSubstats ? 'inherit' : 'ui-monospace, monospace',
                                fontSize: 13,
                                width: c.width,
                                color: isIdx ? (keep ? 'success.main' : 'warning.main') : undefined,
                                // Wrap vs single-line ellipsis controlled by header menu toggle
                                overflow: wrapRows ? 'visible' : 'hidden',
                                textOverflow: wrapRows ? 'clip' : 'ellipsis',
                                whiteSpace: wrapRows ? 'normal' : 'nowrap',
                                wordBreak: wrapRows ? 'break-word' : 'normal',
                              }}
                            >
                              {cellInner}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )})}
                    {padBottom > 0 && (
                      <TableRow key="spacer-bot" sx={{ height: padBottom }}>
                        <TableCell colSpan={colSpan} sx={spacerSx} />
                      </TableRow>
                    )}
                  </>
                )
              })()}
              </TableBody>
            </Table>
          </TableContainer>
        )
      })()}
      {(() => {
        // Small indicator: Showing X–Y of Z when virtualization is active
        const fixedRowH = 28
        const overscan = 20
        let start = 0, end = rules.length
        if (rules.length > 200) {
          if (!wrapRows) {
            start = Math.max(0, Math.floor(scrollTop / fixedRowH) - overscan)
            const visibleCount = Math.ceil((viewportH || 1) / fixedRowH) + overscan * 2
            end = Math.min(rules.length, start + visibleCount)
          } else {
            const pref = prefixHeightsRef.current
            const total = totalHeightRef.current
            const viewBot = Math.min(total, scrollTop + (viewportH || 1))
            const lowerBound = (arr: number[], x: number) => {
              let lo = 0, hi = arr.length - 1, ans = arr.length
              while (lo <= hi) { const mid = (lo + hi) >>> 1; if (arr[mid] >= x) { ans = mid; hi = mid - 1 } else { lo = mid + 1 } }
              return ans
            }
            start = Math.max(0, lowerBound(pref, scrollTop) - overscan)
            end = Math.min(rules.length, lowerBound(pref, viewBot) + overscan)
          }
        }
        const active = rules.length > 200
        if (!active) return null
        const shownStart = Math.min(rules.length, start + 1)
        const shownEnd = Math.min(rules.length, end)
        return (
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Showing {shownStart}–{shownEnd} of {rules.length}</Typography>
          </Box>
        )
      })()}
      <Menu
        open={Boolean(menu?.open)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu?.open ? { top: menu.y, left: menu.x } : undefined}
      >
        {menu?.cfgIdx !== undefined && (
          <>
            {(() => {
              const disabled = menu?.cfgIdx === undefined || menu?.cfgIdx === null
              return (
                <>
                  <MenuItem disabled={disabled} onClick={() => { if (disabled) return; onConfigAction(menu!.cfgIdx!, 'duplicate'); setMenu(null) }}>Duplicate</MenuItem>
                  <MenuItem disabled={disabled} onClick={() => { if (disabled) return; onConfigAction(menu!.cfgIdx!, 'move_top'); setMenu(null) }}>Move to Top</MenuItem>
                  <MenuItem disabled={disabled} onClick={() => { if (disabled) return; onConfigAction(menu!.cfgIdx!, 'move_up'); setMenu(null) }}>Move Up</MenuItem>
                  <MenuItem disabled={disabled} onClick={() => { if (disabled) return; onConfigAction(menu!.cfgIdx!, 'move_down'); setMenu(null) }}>Move Down</MenuItem>
                  <MenuItem disabled={disabled} onClick={() => { if (disabled) return; onConfigAction(menu!.cfgIdx!, 'move_bottom'); setMenu(null) }}>Move to Bottom</MenuItem>
                  <MenuItem disabled={disabled} onClick={() => { if (disabled) return; onConfigAction(menu!.cfgIdx!, 'copy'); setMenu(null) }}>Copy to Clipboard</MenuItem>
                  <MenuItem disabled={disabled} onClick={() => { if (disabled) return; onConfigAction(menu!.cfgIdx!, 'paste_after'); setMenu(null) }}>Paste after</MenuItem>
                  <Divider />
                  <MenuItem disabled={disabled} onClick={() => { if (disabled) return; onConfigAction(menu!.cfgIdx!, 'delete'); setMenu(null) }} sx={{ color: 'error.main' }}>Delete</MenuItem>
                </>
              )
            })()}
            {/* <MenuItem onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(menu!.rule, null, 2)) } catch {} setMenu(null) }}>Copy rule for RSL Helper</MenuItem> */}
          </>
        )}
        {menu?.cfgIdx === undefined && (
          <>
            <MenuItem onClick={() => { onClearBase(); setMenu(null) }}>Clear</MenuItem>
            {/* <MenuItem onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(menu!.rule, null, 2)) } catch {} setMenu(null) }}>Copy rule for RSL Helper</MenuItem> */}
          </>
        )}
      </Menu>
      {(() => {
        // Auto-scroll to first row of selected config when selection changes
        // Run as an inline effect hook
        // eslint-disable-next-line react-hooks/rules-of-hooks
        React.useEffect(() => {
          if (selectedCfgIdx === null) return
          const container = tableContainerRef.current
          if (!container) return
          const row = container.querySelector<HTMLTableRowElement>(`[data-cfg-idx="${selectedCfgIdx}"]`)
          if (row) {
            try {
              const top = row.offsetTop - container.offsetTop
              container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
            } catch {}
          } else {
            // If using virtualization and the row isn't mounted, approximate position
                          const fixedRowH = 30
                          const idx = rules.findIndex(r => (r as any).__cfgIdx === selectedCfgIdx)
            if (idx >= 0) {
              try { container.scrollTo({ top: Math.max(0, idx * fixedRowH), behavior: 'smooth' }) } catch {}
            }
          }
        }, [selectedCfgIdx, rules])
        // Restore first visible row after toggling wrap modes
        // eslint-disable-next-line react-hooks/rules-of-hooks
        React.useEffect(() => {
          if (!pendingRestoreRef.current) return
          pendingRestoreRef.current = false
          const idx = anchorIndexRef.current
          if (idx == null) return
          const container = tableContainerRef.current
          if (!container) return
          const fixedRowH = 28
          const targetTop = !wrapRows
            ? idx * fixedRowH
            : (prefixHeightsRef.current[idx] || 0)
          try {
            requestAnimationFrame(() => {
              container.scrollTo({ top: Math.max(0, targetTop) })
            })
          } catch {}
        }, [wrapRows])
        return null
      })()}
    </Box>
  )
}

function ConfigChip({
  index,
  cfg,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onMoveTop,
  onMoveBottom,
  onPasteAfter,
  selected,
  onSelect,
  isLast,
  linkedHover,
  onHover,
  metasets,
}: {
  index: number
  cfg: BuilderConfig
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveTop: () => void
  onMoveBottom: () => void
  onPasteAfter: () => void
  selected: boolean
  onSelect: () => void
  isLast: boolean
  linkedHover: boolean
  onHover: (enter: boolean) => void
  metasets: Metaset[]
}) {
  const ellipsizeName = (s: string, max = 20) => (s.length <= max ? s : s.slice(0, max - 1) + '…')
  // Build label parts so we can color Keep/Sell and strike only that part, keeping original order
  const fullSummary = summaryOf(cfg, metasets)
  const m = /^Act:\s*(Keep|Sell)\s*(?:\|\s*)?(.*)$/.exec(fullSummary)
  const actText = m ? m[1] : (cfg.keep ? 'Keep' : 'Sell')
  const restSummary = m ? m[2] : fullSummary
  const keepColor = cfg.keep ? 'success.main' : 'error.main'
  const isDisabled = cfg.enabled === false
  const [menu, setMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  // Suppress native context menu while this chip menu is open
  useEffect(() => {
    if (!menu?.open) return
    const handler = (e: MouseEvent) => { e.preventDefault() }
    window.addEventListener('contextmenu', handler)
    return () => { window.removeEventListener('contextmenu', handler) }
  }, [menu?.open])
  return (
    <Box
      id={`cfg-chip-${index}`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : (linkedHover ? 'primary.main' : 'divider'),
        backgroundColor: selected ? 'action.selected' : (linkedHover ? 'action.hover' : 'transparent'),
        borderRadius: 5,
        pl: 1.2,
        pr: 0.5,
        py: 0.5,
        cursor: 'pointer',
      }}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onContextMenu={(e) => { try { e.preventDefault(); e.stopPropagation() } catch {}; setMenu({ open: true, x: e.clientX, y: e.clientY }) }}
    >
      <Typography variant="caption" sx={{ mr: 0.5 }}>
        <Box component="span" title="Click to edit this config" sx={{ display: 'inline' }}>
          {`${index + 1}. `}
          {cfg.name ? `${ellipsizeName(cfg.name)} — ` : ''}
          {isDisabled ? (
            <Box component="span" sx={{ color: 'common.white', textDecoration: 'line-through' }}>
              <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
            </Box>
          ) : (
            <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
          )}
          {restSummary ? ` | ${restSummary}` : ''}
        </Box>
      </Typography>
      <Tooltip title="Move up"><span><IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveUp() }} disabled={index === 0}><ArrowUpwardIcon fontSize="inherit" /></IconButton></span></Tooltip>
      <Tooltip title="Move down"><span><IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveDown() }} disabled={isLast}><ArrowDownwardIcon fontSize="inherit" /></IconButton></span></Tooltip>
      <Tooltip title="Duplicate"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onDuplicate() }}><ContentCopyIcon fontSize="inherit" /></IconButton></Tooltip>
      <Tooltip title="Delete"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete() }} color="error"><DeleteIcon fontSize="inherit" /></IconButton></Tooltip>
      <Menu
        open={Boolean(menu?.open)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu?.open ? { top: menu.y, left: menu.x } : undefined}
      >
        <MenuItem onClick={() => { setMenu(null); onDuplicate() }}>Duplicate</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveTop() }} disabled={index === 0}>Move to Top</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveUp() }} disabled={index === 0}>Move Up</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveDown() }} disabled={isLast}>Move Down</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveBottom() }} disabled={isLast}>Move to Bottom</MenuItem>
        <MenuItem onClick={async () => {
          setMenu(null)
          const text = JSON.stringify(cfg, null, 2)
          // If not a secure context or copy fails, open manual dialog
          let ok = false
          try {
            if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              await navigator.clipboard.writeText(text)
              ok = true
            }
          } catch { ok = false }
          if (!ok) {
            try {
              const ev = new CustomEvent('open-copy-dialog', { detail: text })
              window.dispatchEvent(ev)
            } catch {}
          }
        }}>Copy to Clipboard</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onPasteAfter() }}>Paste after</MenuItem>
        <Divider />
        <MenuItem onClick={() => { setMenu(null); onDelete() }} sx={{ color: 'error.main' }}>Delete</MenuItem>
      </Menu>
    </Box>
  )
}

function summaryOf(cfg: BuilderConfig, metasets: Metaset[]): string {
  const parts: string[] = []
  const ellipsize = (s: string, max = 20) => (s.length <= max ? s : s.slice(0, max - 1) + '…')
  const push = (label: string, value: string) => parts.push(`${label}:${ellipsize(value)}`)

  push('Act', cfg.keep ? 'Keep' : 'Sell')
  {
    const r = formatRank(cfg.rankCode)
    if (r) push('Rank', r)
  }
  {
    const rar = rarityCodeToName(cfg.rarityCode)
    if (rar) push('Rar', rar)
  }
  if (cfg.factionCode && cfg.factionCode !== 0) push('Fac', factionCodeToName(cfg.factionCode))

  // Mainstats
  if ((cfg.mainStats?.length ?? 0) > 0) {
    const names = (cfg.mainStats ?? []).map(m => formatMainStat(m.id, m.f)).filter(Boolean)
    push('Main', names.join(','))
  } else {
    push('Main', 'Any')
  }

  // Substats with fixed indicator
  const fixedSet = new Set((cfg.fixedSubstats ?? []).map(s => `${s.id}:${Boolean(s.isFlat)}`))
  if ((cfg.substats?.length ?? 0) > 0) {
    const names = (cfg.substats ?? []).map(s => `${statNameFromId(s.id, s.isFlat)}${fixedSet.has(`${s.id}:${Boolean(s.isFlat)}`) ? '🔒' : ''}`)
    push('Subs', names.join(','))
  } else {
    push('Subs', 'Any')
  }

  // Required substats indicator removed from chip for clarity

  // Per-substat roll bounds summary
  if (cfg.substatRollBounds && Object.keys(cfg.substatRollBounds).length > 0) {
    const tags: string[] = []
    for (const [k, v] of Object.entries(cfg.substatRollBounds)) {
      const [idStr, flatStr] = k.split(':')
      const id = Number(idStr)
      const isFlat = flatStr === 'true'
      const n = statNameFromId(id, isFlat)
      const min = typeof v.min === 'number' ? Math.max(0, Math.min(5, Math.floor(v.min))) : undefined
      const max = typeof v.max === 'number' ? Math.max(0, Math.min(5, Math.floor(v.max))) : undefined
      let t = ''
      if (min !== undefined && max !== undefined && min === max) t = `${n}=${min}r`
      else if (max === 0 && (min === undefined || min === 0)) t = `${n}=0r`
      else if (min !== undefined) t = `${n}≥${min}r`
      else if (max !== undefined) t = `${n}≤${max}r`
      if (t) tags.push(t)
    }
    if (tags.length) push('Rolls', tags.join(','))
  }

  // Sets and Metasets
  const setNames = (cfg.artifactSets ?? []).map(id => artifactSetNames[id] ?? String(id))
  const metaNames = (cfg.artifactMetaSets ?? []).map(id => metasets.find(m => m.id === id)?.name || id)
  const setsJoined = [...metaNames, ...setNames].join(',')
  if (setsJoined) push('Sets', setsJoined)

  return parts.join(' | ')
}

function BuilderPanel({ cfg, onChange, onAddToCustom, editingIndex, onUpdateSelected, metasets, onMetasetsChange, onDeleteMetaset, minima, onMinimaChange, includeAllExplicitMeta, onIncludeAllExplicitMetaChange }: {
  cfg: BuilderConfig,
  onChange: (c: BuilderConfig) => void
  onAddToCustom: () => void
  editingIndex: number | null
  onUpdateSelected: () => void
  metasets: Metaset[]
  onMetasetsChange: (next: Metaset[]) => void
  onDeleteMetaset: (id: string) => void
  minima: MinimaTable
  onMinimaChange: (m: MinimaTable) => void
  includeAllExplicitMeta: boolean
  onIncludeAllExplicitMetaChange: (v: boolean) => void
}) {
  const update = <K extends keyof BuilderConfig>(k: K, v: BuilderConfig[K]) => onChange({ ...cfg, [k]: v })
  // Help flyout for Count Rolls / Evaluate From / Roll Strategy / Required Substats
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null)
  const [setsOrder, setSetsOrder] = useState<'game' | 'az'>('game')
  const [setsSearch, setSetsSearch] = useState('')
  const [metaDlgOpen, setMetaDlgOpen] = useState(false)
  const [confirmClearSets, setConfirmClearSets] = useState(false)
  const [confirmResetMetasets, setConfirmResetMetasets] = useState(false)
  const [minimaDlgOpen, setMinimaDlgOpen] = useState(false)
  const [confirmResetMinima, setConfirmResetMinima] = useState(false)
  const [showLowStarCols, setShowLowStarCols] = useState(false)
  const [confirmResetBuilder, setConfirmResetBuilder] = useState(false)
  const [confirmDeleteMetaId, setConfirmDeleteMetaId] = useState<string | null>(null)
  const [confirmClearMetaId, setConfirmClearMetaId] = useState<string | null>(null)
  const setsLeftRef = useRef<HTMLDivElement | null>(null)
  const [setsLeftWidth, setSetsLeftWidth] = useState<number>(0)
  // Subtle highlight of controls affected by Reset when hovering the button
  const [hoverReset, setHoverReset] = useState(false)
  // Debounced rule count for the current builder config
  const [ruleCount, setRuleCount] = useState<number | null>(null)
  const [counting, setCounting] = useState<boolean>(false)
  const countTimerRef = useRef<number | null>(null)
  useEffect(() => {
    // Debounce to avoid blocking typing/interactions
    if (countTimerRef.current) { clearTimeout(countTimerRef.current) as any; countTimerRef.current = null }
    setCounting(true)
    // Small delay to keep UI responsive while editing
    const id = window.setTimeout(() => {
      try {
        const built = buildHsfRules(cfg, minima)
        const { obsolete } = findObsoleteRules(built)
        const removed = new Set(obsolete.map(o => o.index))
        const n = built.filter((_, i) => !removed.has(i)).length
        setRuleCount(n)
      } catch (e) {
        // In case of unexpected errors, avoid crashing the UI
        setRuleCount(null)
      } finally {
        setCounting(false)
      }
    }, 300)
    countTimerRef.current = id as any
    return () => { if (countTimerRef.current) { clearTimeout(countTimerRef.current) as any; countTimerRef.current = null } }
  }, [cfg, minima])
  useEffect(() => {
    const el = setsLeftRef.current
    if (!el) return
    const measure = () => setSetsLeftWidth(el.getBoundingClientRect().width)
    measure()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(el)
    } else {
      window.addEventListener('resize', measure)
    }
    return () => {
      if (ro) ro.disconnect()
      else window.removeEventListener('resize', measure)
    }
  }, [])

  return (
    <Box>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
        columnGap: 1,
        rowGap: 2,
      }}>
        <TextField
          label="Rule Name"
          value={cfg.name ?? ''}
          onChange={(e) => update('name', e.target.value)}
          fullWidth
          sx={{ gridColumn: '1 / -1' }}
        />

        <FormControl sx={(theme) => ({
          gridColumn: '1 / -1',
          borderRadius: 1,
          transition: 'background-color 220ms ease-in-out 60ms',
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <FormLabel sx={{ mb: 0.5 }} title="Enable this config. When off, the rules are still exported but ignored by RSL Helper. Disabled rules show a white strikethrough in preview and on the chip (Keep/Sell).">Action</FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.keep ? 'keep' : 'sell'}
              onChange={(_, v) => v && update('keep', v === 'keep')}
              sx={{ height: 40 }}
            >
            <ToggleButton
              value="keep"
              sx={cfg.keep ? {
                borderColor: 'success.main',
                color: 'success.main',
                '&.Mui-selected': {
                  bgcolor: 'success.main',
                  color: '#fff',
                  '&:hover': { bgcolor: 'success.dark' },
                },
              } : {}}
            >
              Keep
            </ToggleButton>
            <ToggleButton
              value="sell"
              sx={!cfg.keep ? {
                borderColor: 'error.main',
                color: 'error.main',
                '&.Mui-selected': {
                  bgcolor: 'error.main',
                  color: '#fff',
                  '&:hover': { bgcolor: 'error.dark' },
                },
              } : {}}
            >
              Sell
            </ToggleButton>
            </ToggleButtonGroup>
            <FormControlLabel
              sx={{ ml: 1, userSelect: 'none' }}
              control={
                <Switch
                  size="small"
                  checked={cfg.enabled !== false}
                  onChange={(e) => update('enabled', e.target.checked)}
                  inputProps={{ title: 'Enable this config. When off, the rules are exported but ignored by RSL Helper. Disabled rules show a white strikethrough in preview and on the chip (Keep/Sell).' }}
                />
              }
              label={<Typography variant="body2" title={'Enable this config. When off, the rules are exported but ignored by RSL Helper. Disabled rules show a white strikethrough in preview and on the chip (Keep/Sell).'}>Enabled</Typography>}
            />
          </Box>
        </FormControl>

        {/* Row 2: Left half (Rank, Rarity, Faction) */}
        <Box sx={(theme) => ({
          gridColumn: '1 / 3',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))',
          columnGap: 1,
          rowGap: 2,
          borderRadius: 1,
          transition: 'background-color 220ms ease-in-out 60ms',
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }} title="Choose exact stars or ranges like '≥ 5★' or '≤ 6★'. 'Any' matches all. Thresholds adjust conservatively.">Rank</FormLabel>
          <Select
            size="small"
            value={String(cfg.rankCode)}
            onChange={(e: SelectChangeEvent<string>) => update('rankCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
          >
            <MenuItem value={String(0)}>{formatRank(0) || 'Any'}</MenuItem>
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Exact</ListSubheader>
            {[1,2,3,4,5,6].map((code) => (
              <MenuItem key={code} value={String(code)}>{formatRank(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>≥ Ranges</ListSubheader>
            {[7,8,9,10,11].map((code) => (
              <MenuItem key={code} value={String(code)}>{formatRank(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>≤ Ranges</ListSubheader>
            {[12,13,14,15,16].map((code) => (
              <MenuItem key={code} value={String(code)}>{formatRank(code)}</MenuItem>
            ))}
          </Select>
          {/* Tooltip moved to label title to reduce clutter */}
        </FormControl>

        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }} title="Pick an exact rarity or a range. For ranges, roll behavior uses a strict assumption (similar to Legendary/Mythical).">Rarity</FormLabel>
          <Select
            size="small"
            value={String(cfg.rarityCode)}
            onChange={(e: SelectChangeEvent<string>) => update('rarityCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
          >
            <MenuItem value={String(0)}>{rarityCodeToName(0) || 'Any'}</MenuItem>
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Exact</ListSubheader>
            {[1,2,3,4,5,15].map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>≥ Ranges</ListSubheader>
            {[6,7,8,9,16].map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>≤ Ranges</ListSubheader>
            {[10,11,12,13,14].map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code)}</MenuItem>
            ))}
          </Select>
          {/* Tooltip moved to label title to reduce clutter */}
        </FormControl>

        {/* Faction selection (accessories only) */}
        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }} title="Applies to accessories (Ring, Amulet, Banner). Other gear ignores faction.">Faction</FormLabel>
          <Select
            size="small"
            value={String(cfg.factionCode ?? 0)}
            onChange={(e: SelectChangeEvent<string>) => update('factionCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
          >
            <MenuItem value={String(0)}>Any</MenuItem>
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Telerian League</ListSubheader>
            {[1,2,3,13].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Gaellen Pact</ListSubheader>
            {[5,6,7,8].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>The Corrupted</ListSubheader>
            {[9,10,11,12].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Nyresan Union</ListSubheader>
            {[16,14,15].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionCodeToName(code)}</MenuItem>
            ))}
          </Select>
        </FormControl>
        </Box>
        {/* Row 2: Right half (Count Rolls, Evaluate From, Roll Strategy) */}
        <Box sx={(theme) => ({
          gridColumn: '3 / 5',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          borderRadius: 1,
          transition: 'background-color 220ms ease-in-out 60ms',
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
        <FormControl>
          <FormLabel sx={{ mb: 0.5 }} title={'From: count rolls after "Evaluate From". All: include prior rolls up to each level.'}>Count Rolls</FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.rollBaseline === 'upToLevel' ? 'upToLevel' : 'afterStart'}
              onChange={(_, v) => v && update('rollBaseline', v)}
              sx={{ height: 40 }}
            >
              <ToggleButton value="afterStart">From</ToggleButton>
              <ToggleButton value="upToLevel">All</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </FormControl>

        <FormControl>
          <FormLabel sx={{ mb: 0.5 }} title="First level to check thresholds.">Evaluate From</FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={String(cfg.startLevel)}
              onChange={(_, v) => {
                if (!v) return
                if (v === 'any') {
                  // Selecting Any forces Roll Strategy to Off
                  onChange({ ...cfg, rollMode: 'off', startLevel: 'any' })
                  return
                }
                const next = Number(v) as any
                update('startLevel', next)
              }}
              sx={{ height: 40 }}
            >
              {LEVELS.map((l) => (
                <ToggleButton key={l} value={String(l)}>+{l}</ToggleButton>
              ))}
              <ToggleButton value={'any'}>Any</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </FormControl>

        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, gap: 0.5 }}>
            <FormLabel title="Strategy: Off (ignores badges), Strict (only fully feasible at each level), Potential (allow progress & strict once feasible), Auto (Strict when no substats are selected; Potential otherwise).">Roll Strategy</FormLabel>
            <Tooltip title="How rolls, levels, strategy, and Required work (click)">
              <IconButton
                size="small"
                color="primary"
                onClick={(e) => setHelpAnchor(e.currentTarget)}
                sx={{ ml: 0.5, p: 0, width: 20, height: 20, alignSelf: 'center' }}
                aria-label="How rolls, levels, strategy, and Required work (click)"
              >
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.rollMode}
              onChange={(_, v) => {
                if (!v) return
                if (v !== 'off' && cfg.startLevel === 'any') {
                  // Coerce invalid combination: when leaving Off, force startLevel to 0
                  onChange({ ...cfg, rollMode: v, startLevel: 0 })
                } else {
                  update('rollMode', v)
                }
              }}
              sx={{ height: 40 }}
            >
              <ToggleButton value="off">Off</ToggleButton>
              <ToggleButton value="auto">Auto</ToggleButton>
              <ToggleButton value="strict">Strict</ToggleButton>
              <ToggleButton value="potential">Potential</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </FormControl>
        {/* Info icon moved next to the Roll Strategy label */}
        </Box>
        {/* Help popover */}
        <Popover
          open={Boolean(helpAnchor)}
          anchorEl={helpAnchor}
          onClose={() => setHelpAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          <Box sx={{ p: 2, maxWidth: 560 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>How these settings work</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Count Rolls</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              From: count only rolls after “Evaluate From”. All: include prior rolls up to each level.
              Example (6★ SPD base 5, start 8–11): From → SPD 5/10/15 …; All → SPD 15/20/25 …
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Evaluate From</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              First level range to check (0–3, 4–7, 8–11, 12–15, 16). “Any” applies at any level and switches Strategy to Off.
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Roll Strategy</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Off: ignore roll badges; single check at the start level. Strict: only rows fully possible at each level. Potential: show early progress rows; once feasible, include the strict row and any still‑feasible progress rows. Auto: Strict when no substats are selected; Potential when at least one substat is selected.
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Required Substats</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              How many of the selected substats must be present (fixed ones are always included). Auto = min(4, selected).
              Example: Select SPD, ACC, HP% with Required 2 → rules target any 2 of them (fixed ones always included).
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>Quick example 1 (badges)</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
{`Input: SPD(2) + ACC(★), Required = 2, Count Rolls = From, Evaluate From = 0–3, Roll Strategy = Potential
0–3: SPD ≥ 5, ACC ≥ 9
4–7: SPD ≥ 10, ACC ≥ 9   •   SPD ≥ 5, ACC ≥ 18
8–11: SPD ≥ 15, ACC ≥ 9   •   SPD ≥ 10, ACC ≥ 9 (still catch-up feasible)
12–15: SPD ≥ 15, ACC ≥ 9 (plus any catch-up-feasible progress rows)
16: SPD ≥ 15, ACC ≥ 9`}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Note: Strict shows only SPD ≥ 15, ACC ≥ 9 at and after 8–11; Off ignores badges entirely and shows presence at the start level only.
            </Typography>

            
          </Box>
        </Popover>
        {/* Row 3: Mainstat (left), Substats (right) */}
        <FormControl sx={(theme) => ({
          gridColumn: '1 / 3',
          borderRadius: 1,
          transition: 'background-color 220ms ease-in-out 60ms',
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <FormLabel sx={{ mb: 0.5 }} title="Select one or more main stats. Selecting none equals Any. HP/ATK/DEF can be flat or percent.">Mainstat</FormLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              const encode = (id: number, f?: number) => `${id}:${f ?? ''}`
              const value: string[] = (cfg.mainStats?.length ?? 0) === 0
                ? ['any']
                : (cfg.mainStats ?? []).map(s => encode(s.id, s.f))
              const handleChange = (_: any, v: string[]) => {
                if (!Array.isArray(v)) return
                const prevHadAny = (cfg.mainStats?.length ?? 0) === 0
                const hasAny = v.includes('any')
                const others = v.filter(x => x !== 'any')

                if (others.length === 0) {
                  // Any
                  onChange({ ...cfg, mainStats: [] })
                  return
                }

                if (hasAny) {
                  if (prevHadAny) {
                    const next = others.map(token => {
                      const [idStr, fStr] = String(token).split(':')
                      return { id: Number(idStr), f: fStr !== '' ? Number(fStr) : undefined }
                    })
                    onChange({ ...cfg, mainStats: next })
                  } else {
                    onChange({ ...cfg, mainStats: [] })
                  }
                  return
                }

                const next = others.map(token => {
                  const [idStr, fStr] = String(token).split(':')
                  return { id: Number(idStr), f: fStr !== '' ? Number(fStr) : undefined }
                })
                onChange({ ...cfg, mainStats: next })
              }
              return (
                <>
                  {/* Row 1: Any */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: 144, height: 36 } }}>
                    <ToggleButton value="any">Any</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ gap: 0.5, '& .MuiToggleButton-root': { px: 0.75, minWidth: 72, width: 72, height: 36, justifyContent: 'center' } }}>
                    <ToggleButton value="1:1">HP</ToggleButton>
                    <ToggleButton value="1:0">HP%</ToggleButton>
                    <ToggleButton value="2:1">ATK</ToggleButton>
                    <ToggleButton value="2:0">ATK%</ToggleButton>
                    <ToggleButton value="3:1">DEF</ToggleButton>
                    <ToggleButton value="3:0">DEF%</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ gap: 0.5, '& .MuiToggleButton-root': { px: 0.75, minWidth: 72, width: 72, height: 36, justifyContent: 'center' } }}>
                    <ToggleButton value="4:">SPD</ToggleButton>
                    <ToggleButton value="5:1">RES</ToggleButton>
                    <ToggleButton value="6:1">ACC</ToggleButton>
                    <ToggleButton value="7:0">CR%</ToggleButton>
                    <ToggleButton value="8:0">CDMG%</ToggleButton>
                  </ToggleButtonGroup>
                </>
              )
            })()}
          </Box>
        </FormControl>

        <FormControl sx={(theme) => ({
          gridColumn: '3 / 5',
          borderRadius: 1,
          transition: 'background-color 220ms ease-in-out 60ms',
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <FormLabel sx={{ mb: 0.5 }} title="Select substats to target; set the minimum above. Choose ‘Any’ to allow any substats (equivalent to selecting none).">Substats</FormLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              const encode = (id: number, isFlat?: boolean) => `${id}:${isFlat ? 1 : 0}`
              const keyOf = (id: number, isFlat?: boolean) => `${id}:${Boolean(isFlat)}`
              const value: string[] = (cfg.substats?.length ?? 0) === 0
                ? ['any']
                : cfg.substats.map(s => encode(s.id, s.isFlat))
              const isSelected = (id: number, isFlat?: boolean) => cfg.substats.some(s => s.id === id && Boolean(s.isFlat) === Boolean(isFlat))
              const isFixed = (id: number, isFlat?: boolean) => (cfg.fixedSubstats ?? []).some(s => s.id === id && Boolean(s.isFlat) === Boolean(isFlat))
              const getBounds = (id: number, isFlat?: boolean) => (cfg.substatRollBounds ?? {})[keyOf(id, isFlat)]
              const setBounds = (id: number, isFlat: boolean | undefined, b?: { min?: number; max?: number; any?: boolean }) => {
                const key = keyOf(id, isFlat)
                const next = { ...(cfg.substatRollBounds ?? {}) }
                if (!b || (b.min === undefined && b.max === undefined && !('any' in b && b.any))) delete next[key]
                else next[key] = b
                onChange({ ...cfg, substatRollBounds: Object.keys(next).length ? next : undefined })
              }
              // No unset: default is star (any). Left click cycles Min (*,1..5,*). Shift-click cycles Max (*,0..5,*).
              const cycleMin = (id: number, isFlat?: boolean, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(id, isFlat)
                const isAny = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const curMin = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                if (isAny) {
                  // ★ -> 1 (Min)
                  setBounds(id, isFlat, { min: 1 })
                } else if (hasMin && curMin < 5) {
                  // 1..4 -> +1; 5 handled below
                  setBounds(id, isFlat, { min: curMin + 1 })
                } else {
                  // none or 5 -> ★
                  setBounds(id, isFlat, { any: true })
                }
              }
              const cycleMinDown = (id: number, isFlat?: boolean, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(id, isFlat)
                const isAny = Boolean(b?.any)
                const curMin = Math.max(0, Math.min(5, Number(b?.min ?? 0)))
                if (isAny) {
                  // wildcard -> 5
                  setBounds(id, isFlat, { min: 5 })
                  return
                }
                const nextMin = curMin - 1
                if (nextMin >= 1) {
                  setBounds(id, isFlat, { min: nextMin })
                } else if (nextMin === 0) {
                  // back to 0 -> clear
                  setBounds(id, isFlat, undefined)
                } else {
                  // below 0 means we were at 0 -> go to wildcard
                  setBounds(id, isFlat, { any: true })
                }
              }
              const cycleMax = (id: number, isFlat?: boolean, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(id, isFlat)
                const isAny = Boolean(b?.any)
                const hasMax = typeof b?.max === 'number'
                const curMax = hasMax ? Math.max(0, Math.min(5, Number(b?.max))) : 0
                if (isAny) {
                  // ★ -> 0 (Max)
                  setBounds(id, isFlat, { max: 0 })
                } else if (hasMax && curMax < 5) {
                  // 0..4 -> +1
                  setBounds(id, isFlat, { max: curMax + 1 })
                } else if (hasMax && curMax === 5) {
                  // 5 -> ★
                  setBounds(id, isFlat, { any: true })
                } else {
                  // none -> ★
                  setBounds(id, isFlat, { any: true })
                }
              }
              // Remove max-decrement via right click; shift-click cycles 0..5..0
              const setExact = (id: number, isFlat: boolean | undefined, n: number) => setBounds(id, isFlat, { min: n, max: n })
              const setAtLeast = (id: number, isFlat: boolean | undefined, n: number) => setBounds(id, isFlat, { min: n })
              const setUnrolledOnly = (id: number, isFlat: boolean | undefined) => setBounds(id, isFlat, { max: 0 })
              const toggleFixed = (id: number, isFlat?: boolean) => {
                const sel = isSelected(id, isFlat)
                const keyMatch = (s: {id:number; isFlat?: boolean}) => s.id === id && Boolean(s.isFlat) === Boolean(isFlat)
                let nextSelected = cfg.substats
                if (!sel) {
                  nextSelected = cfg.substats.concat({ id, isFlat })
                }
                const exists = isFixed(id, isFlat)
                const nextFixed = exists
                  ? (cfg.fixedSubstats ?? []).filter(s => !keyMatch(s))
                  : (cfg.fixedSubstats ?? []).concat({ id, isFlat })
                const bumpMin = (cfg.minCount === 0) && (cfg.substats.length === 0) && (nextSelected.length > 0)
                const nextMin = (cfg.autoMinCount ? Math.min(4, nextSelected.length) : (bumpMin ? 1 : cfg.minCount)) as 0|1|2|3|4
                onChange({ ...cfg, substats: nextSelected, fixedSubstats: nextFixed, minCount: nextMin })
              }
              const cycleSubstat = (id: number, isFlat?: boolean, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const keyMatch = (s: {id:number; isFlat?: boolean}) => s.id === id && Boolean(s.isFlat) === Boolean(isFlat)
                const selected = isSelected(id, isFlat)
                const fixed = isFixed(id, isFlat)
                if (!selected) {
                  const next = cfg.substats.concat({ id, isFlat })
                  const nextMin = (cfg.autoMinCount ? Math.min(4, next.length) : ((cfg.minCount === 0 && next.length > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                  const key = `${id}:${Boolean(isFlat)}`
                  const b = { ...(cfg.substatRollBounds ?? {}) }
                  // New selection starts as ★ (wildcard)
                  b[key] = { any: true }
                  const pruned = Object.keys(b).length ? b : undefined
                  onChange({ ...cfg, substats: next, minCount: nextMin, substatRollBounds: pruned })
                  return
                }
                if (selected && !fixed) {
                  const nextFixed = (cfg.fixedSubstats ?? []).concat({ id, isFlat })
                  onChange({ ...cfg, fixedSubstats: nextFixed })
                  return
                }
                // was fixed -> remove entirely
                const nextSubs = cfg.substats.filter(s => !keyMatch(s))
                const nextFixed = (cfg.fixedSubstats ?? []).filter(s => !keyMatch(s))
                // prune bounds for removed substat
                const b = { ...(cfg.substatRollBounds ?? {}) }
                delete b[`${id}:${Boolean(isFlat)}`]
                const pruned = Object.keys(b).length ? b : undefined
                const nextMin = (cfg.autoMinCount ? Math.min(4, nextSubs.length) : (cfg.minCount > nextSubs.length ? (nextSubs.length as 0|1|2|3|4) : cfg.minCount)) as 0|1|2|3|4
                onChange({ ...cfg, substats: nextSubs, fixedSubstats: nextFixed, substatRollBounds: pruned, minCount: nextMin })
              }
              const handleChange = (_: any, v: string[]) => {
                if (!Array.isArray(v)) return
                const prevHadAny = (cfg.substats?.length ?? 0) === 0
                const hasAny = v.includes('any')
                const others = v.filter(x => x !== 'any')

                if (others.length === 0) {
                  // No specific substats selected -> Any
                  onChange({ ...cfg, substats: [], fixedSubstats: [], minCount: 0, substatRollBounds: undefined })
                  return
                }

                if (hasAny) {
                  if (prevHadAny) {
                    // Transition from Any -> specifics: drop Any, keep specifics
                    const next = others.map(token => {
                      const [idStr, fStr] = String(token).split(':')
                      return { id: Number(idStr), isFlat: fStr === '1' }
                    })
                    const nextFixed = (cfg.fixedSubstats ?? []).filter(fs => next.some(s => s.id === fs.id && Boolean(s.isFlat) === Boolean(fs.isFlat)))
                    // prune bounds for removed substats
                    const nextBounds = (() => {
                      const b = cfg.substatRollBounds ?? {}
                      const keepKeys = new Set(next.map(s => keyOf(s.id, s.isFlat)))
                      const out: Record<string, {min?:number;max?:number}> = {}
                      for (const [k,v] of Object.entries(b)) if (keepKeys.has(k)) out[k] = v
                      return Object.keys(out).length ? out : undefined
                    })()
                    const nextMin = (cfg.autoMinCount ? Math.min(4, next.length) : ((cfg.minCount === 0 && next.length > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                    onChange({ ...cfg, substats: next, fixedSubstats: nextFixed, minCount: nextMin, substatRollBounds: nextBounds })
                  } else {
                    // Was on specifics, user clicked Any -> switch to Any
                    onChange({ ...cfg, substats: [], fixedSubstats: [], minCount: 0, substatRollBounds: undefined })
                  }
                  return
                }

                // Only specifics selected
                const next = others.map(token => {
                  const [idStr, fStr] = String(token).split(':')
                  return { id: Number(idStr), isFlat: fStr === '1' }
                })
                const nextFixed = (cfg.fixedSubstats ?? []).filter(fs => next.some(s => s.id === fs.id && Boolean(s.isFlat) === Boolean(fs.isFlat)))
                const nextBounds = (() => {
                  const b = cfg.substatRollBounds ?? {}
                  const keepKeys = new Set(next.map(s => keyOf(s.id, s.isFlat)))
                  const out: Record<string, {min?:number;max?:number}> = {}
                  for (const [k,v] of Object.entries(b)) if (keepKeys.has(k)) out[k] = v
                  return Object.keys(out).length ? out : undefined
                })()
                const nextMin = (cfg.autoMinCount ? Math.min(4, next.length) : ((cfg.minCount === 0 && next.length > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                onChange({ ...cfg, substats: next, fixedSubstats: nextFixed, minCount: nextMin, substatRollBounds: nextBounds })
              }
              // Removed context menu for roll circles for now (can be added later)
              const BtnContent = ({ label, id, isFlat }: { label: string; id: number; isFlat?: boolean }) => {
                const b = getBounds(id, isFlat)
                const isWildcard = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const min = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                const max = (typeof b?.max === 'number' && isFinite(b.max)) ? Math.max(0, Math.min(5, Number(b?.max))) : undefined
                const isUnset = false // no unset in UI; default is ★
                const isUnrolledOnly = max === 0 && !hasMin
                const disabled = cfg.rollMode === 'off'
                const selected = isSelected(id, isFlat)
                const title = disabled
                  ? 'Roll badge disabled.'
                  : 'Badge: click = Min Rolls (★, 1–5). Shift+click = Max Rolls (0–5). Min is green, Max is red.'
                return (
                  <Box
                    className="roll-container"
                    sx={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: selected ? 'flex-start' : 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <Box
                      className="roll-label"
                      component="span"
                      sx={{
                        pointerEvents: 'none',
                        pl: selected ? 0.75 : 3.5,
                        pr: 3.5,
                        textAlign: selected ? 'left' : 'center',
                        width: '100%',
                        transition: 'padding-left 160ms ease, text-align 160ms ease',
                        willChange: 'padding-left, text-align',
                      }}
                    >
                      {label}
                    </Box>
                    {/* Lock indicator overlay (visual only) */}
                    <Box sx={{ position: 'absolute', top: -12, left: -8, opacity: isFixed(id, isFlat) ? 0.9 : 0, transition: 'opacity .15s', pointerEvents: 'none', zIndex: 3 }}>
                      <LockIcon sx={{ fontSize: 14 }} />
                    </Box>
                    <Box
                      className="roll-badge"
                      role="button"
                      onClick={(e) => { if (!isSelected(id, isFlat)) return; if (e.shiftKey) cycleMax(id, isFlat, e); else cycleMin(id, isFlat, e) }}
                      title={title}
                      sx={{
                        position: 'absolute',
                        top: '50%',
                        right: 4,
                        transform: 'translateY(-50%)',
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        lineHeight: 1,
                        userSelect: 'none',
                        cursor: (!isSelected(id, isFlat) || disabled) ? 'default' : 'pointer',
                        opacity: (!isSelected(id, isFlat)) ? 0 : (disabled ? 0.5 : 1),
                        pointerEvents: isSelected(id, isFlat) ? 'auto' : 'none',
                        border: '1px solid',
                        borderStyle: 'solid',
                        borderColor: (isWildcard
                          ? 'success.main'
                          : (max !== undefined
                              ? 'error.main'
                              : (hasMin ? 'success.main' : 'text.secondary'))),
                        color: isWildcard
                          ? 'common.white'
                          : (max !== undefined
                              ? 'error.contrastText'
                              : (hasMin ? 'common.white' : 'text.secondary')),
                        bgcolor: isWildcard
                          ? 'success.main'
                          : (max !== undefined
                              ? 'error.main'
                              : (hasMin ? 'success.main' : 'transparent')),
                        zIndex: 2,
                      }}
                    >
                      {isWildcard ? '★' : (max !== undefined ? String(max) : (hasMin ? String(min) : ''))}
                    </Box>
                  </Box>
                )
              }
              return (
                <>
                  {/* Row 1: Any */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: 144, height: 36 } }}>
                  <ToggleButton value="any">Any</ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary">
                  Click to select; click again to lock (🔒). Badge: click = Min Rolls (★, 1–5), Shift+click = Max Rolls (0–5). Min is green, Max is red.
                </Typography>
              </Box>
              {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
              <ToggleButtonGroup
                size="small"
                value={value}
                onChange={() => {}}
                sx={{
                  gap: 0.5,
                  '& .MuiToggleButton-root': {
                    px: 0.5,
                    minWidth: 88,
                    width: 88,
                    height: 36,
                    justifyContent: 'center',
                    position: 'relative',
                    boxSizing: 'border-box',
                  },
                  // Eliminate MUI's negative margin that causes 1px shifts when selected state changes
                  '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                    marginLeft: '0 !important',
                    borderLeft: '1px solid transparent',
                  },
                  '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': {
                    marginLeft: '0 !important',
                    borderLeft: '1px solid transparent',
                  },
                  // Hover affordance for unselected buttons: show hollow badge and left-align text
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-container': {
                    justifyContent: 'flex-start !important',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-label': {
                    paddingLeft: '6px !important', // equals pl: 0.75 spacing
                    textAlign: 'left !important',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-badge': {
                    opacity: 1,
                    backgroundColor: 'transparent',
                    color: 'transparent',
                  },
                }}
              >
                <ToggleButton value="1:1" onClick={(e)=>cycleSubstat(1, true, e)}><BtnContent label="HP" id={1} isFlat /></ToggleButton>
                <ToggleButton value="1:0" onClick={(e)=>cycleSubstat(1, false, e)}><BtnContent label="HP%" id={1} isFlat={false} /></ToggleButton>
                <ToggleButton value="2:1" onClick={(e)=>cycleSubstat(2, true, e)}><BtnContent label="ATK" id={2} isFlat /></ToggleButton>
                <ToggleButton value="2:0" onClick={(e)=>cycleSubstat(2, false, e)}><BtnContent label="ATK%" id={2} isFlat={false} /></ToggleButton>
                <ToggleButton value="3:1" onClick={(e)=>cycleSubstat(3, true, e)}><BtnContent label="DEF" id={3} isFlat /></ToggleButton>
                <ToggleButton value="3:0" onClick={(e)=>cycleSubstat(3, false, e)}><BtnContent label="DEF%" id={3} isFlat={false} /></ToggleButton>
              </ToggleButtonGroup>
              {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
              <ToggleButtonGroup
                size="small"
                value={value}
                onChange={() => {}}
                sx={{
                  gap: 0.5,
                  '& .MuiToggleButton-root': {
                    px: 0.5,
                    minWidth: 88,
                    width: 88,
                    height: 36,
                    justifyContent: 'center',
                    position: 'relative',
                    boxSizing: 'border-box',
                  },
                  '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                    marginLeft: '0 !important',
                    borderLeft: '1px solid transparent',
                  },
                  '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': {
                    marginLeft: '0 !important',
                    borderLeft: '1px solid transparent',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-container': {
                    justifyContent: 'flex-start !important',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-label': {
                    paddingLeft: '6px !important', // equals pl: 0.75 spacing
                    textAlign: 'left !important',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-badge': {
                    opacity: 1,
                    backgroundColor: 'transparent',
                    color: 'transparent',
                  },
                }}
              >
                <ToggleButton value="4:1" onClick={(e)=>cycleSubstat(4, true, e)}><BtnContent label="SPD" id={4} isFlat /></ToggleButton>
                <ToggleButton value="5:1" onClick={(e)=>cycleSubstat(5, true, e)}><BtnContent label="RES" id={5} isFlat /></ToggleButton>
                <ToggleButton value="6:1" onClick={(e)=>cycleSubstat(6, true, e)}><BtnContent label="ACC" id={6} isFlat /></ToggleButton>
                <ToggleButton value="7:0" onClick={(e)=>cycleSubstat(7, false, e)}><BtnContent label="CR%" id={7} isFlat={false} /></ToggleButton>
                <ToggleButton value="8:0" onClick={(e)=>cycleSubstat(8, false, e)}><BtnContent label="CDMG%" id={8} isFlat={false} /></ToggleButton>
              </ToggleButtonGroup>
                  {/* Context menu for roll options is intentionally disabled for now */}
                </>
              )
            })()}
          </Box>
        </FormControl>

        {/* Row 4 moved below with Sets */}
        {/* Slots grid 3x3 with icons */}
        <FormControl sx={(theme) => ({
          gridColumn: '1 / 3',
          borderRadius: 1,
          transition: 'background-color 220ms ease-in-out 60ms',
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <FormLabel sx={{ mb: 0.5 }} title="Apply this rule only to the selected gear slots.">Slots</FormLabel>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
            {[
              { id: 5, name: 'Weapon', Icon: GavelIcon },
              { id: 1, name: 'Helmet', Icon: MilitaryTechIcon },
              { id: 6, name: 'Shield', Icon: ShieldIcon },
              { id: 3, name: 'Gauntlets', Icon: BackHandIcon },
              { id: 2, name: 'Chestplate', Icon: CheckroomIcon },
              { id: 4, name: 'Boots', Icon: HikingIcon },
              { id: 7, name: 'Ring', Icon: DiamondIcon },
              { id: 8, name: 'Amulet', Icon: AutoAwesomeIcon },
              { id: 9, name: 'Banner', Icon: FlagIcon },
            ].map(({ id, name, Icon }) => {
              const selected = (cfg.artifactTypes ?? []).includes(id)
              return (
                <Box
                  key={id}
                  onClick={() => {
                    const set = new Set(cfg.artifactTypes ?? [])
                    if (selected) set.delete(id); else set.add(id)
                    update('artifactTypes', Array.from(set))
                  }}
                  sx={{
                    border: '1px solid',
                    borderColor: selected ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    p: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    bgcolor: selected ? 'action.selected' : 'transparent',
                  }}
                >
                  <Icon fontSize="small" />
                  <Typography variant="caption" sx={{ mt: 0.5 }}>{name}</Typography>
                </Box>
              )
            })}
          </Box>
        </FormControl>

        {/* Right column combined: Required substats + Sets in one grid cell */}
        <Box sx={(theme) => ({
          gridColumn: '3 / 5',
          display: 'grid',
          rowGap: 1,
          borderRadius: 1,
          transition: 'background-color 220ms ease-in-out 60ms',
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
        <FormControl>
          <FormLabel sx={{ mb: 0.5 }} title="How many of your selected substats must be present. All fixed substats are always included. Target size = max(Required, Fixed), capped at 4.">Required substats</FormLabel>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: setsLeftWidth ? `${setsLeftWidth}px` : 'auto', minWidth: setsLeftWidth ? `${setsLeftWidth}px` : 0 }}>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={cfg.autoMinCount ? 'auto' : (cfg.minCount > 0 ? String(cfg.minCount) : 'auto')}
                onChange={(_, v) => {
                  if (!v) return
                  if (v === 'auto') {
                    const nextMin = Math.min(4, cfg.substats.length) as 0|1|2|3|4
                    onChange({ ...cfg, autoMinCount: true, minCount: nextMin })
                    return
                  }
                  const next = Number(v) as 1|2|3|4
                  onChange({ ...cfg, autoMinCount: false, minCount: next })
                }}
              >
                <ToggleButton value="auto">Auto</ToggleButton>
                {([1,2,3,4] as const).map((n) => (
                  <ToggleButton key={n} value={String(n)}>{n}</ToggleButton>
                ))}
              </ToggleButtonGroup>
              {(() => {
                const warnMin = cfg.substats.length < cfg.minCount
                const warnFixed = (cfg.fixedSubstats?.length ?? 0) > 4
                let msg: string | null = null
                if (warnMin) msg = `Required (${cfg.minCount}) > chosen (${cfg.substats.length})`
                else if (warnFixed) msg = `Fixed substats (${cfg.fixedSubstats?.length ?? 0}) exceed 4 — extra will be ignored`
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0, height: 32, visibility: msg ? 'visible' : 'hidden' }}>
                    <Typography variant="caption" color="warning.main">Warning:</Typography>
                    <Typography variant="caption" color="warning.main" sx={{ whiteSpace: 'nowrap' }}>{msg ?? ''}</Typography>
                  </Box>
                )
              })()}
            </Box>
            <Button size="small" variant="outlined" onClick={() => setMinimaDlgOpen(true)} sx={{ whiteSpace: 'nowrap', minWidth: 160 }}>Substat Values…</Button>
          </Box>
        </FormControl>

        {/* Sets multi-select with order toggle and search */}
        <FormControl>
          <FormLabel sx={{ mb: 0.5 }} title="Apply this rule only to the selected gear sets.">Sets</FormLabel>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, minWidth: 0 }}>
            <Box ref={setsLeftRef} sx={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 520px) auto', gap: 0.5, alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
              <MuiTextField size="small" label="Search sets" value={setsSearch} onChange={(e) => setSetsSearch(e.target.value)} sx={{ width: '100%' }} />
              <ToggleButtonGroup size="small" value={setsOrder} exclusive onChange={(_, v) => v && setSetsOrder(v)}>
                <ToggleButton value="game">Game</ToggleButton>
                <ToggleButton value="az">A–Z</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Button size="small" variant="outlined" onClick={() => setMetaDlgOpen(true)} sx={{ minWidth: 160, whiteSpace: 'nowrap' }}>Manage metasets…</Button>
          </Box>
          {(() => {
            const tokenOf = {
              meta: (id: string) => `m:${id}`,
              set: (id: number) => `s:${id}`,
            }
            const selectedTokens: string[] = [
              ...(cfg.artifactMetaSets ?? []).map(tokenOf.meta),
              ...(cfg.artifactSets ?? []).map(tokenOf.set).map(String),
            ]
            const handleChange = (e: any) => {
              const tokens = e.target.value as string[]
              const metaIds = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
              const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
              onChange({ ...cfg, artifactMetaSets: metaIds, artifactSets: setIds })
            }
            const renderValue = (tokens: string[]) => {
              if (!tokens || tokens.length === 0) return 'Any'
              const names: string[] = []
              for (const t of tokens) {
                if (t.startsWith('m:')) {
                  const id = t.slice(2)
                  if (id === 'meta__ALL_EXPLICIT' && includeAllExplicitMeta) {
                    names.push('All (Explicit)')
                  } else {
                    const m = metasets.find(x => x.id === id)
                    if (m) names.push(m.name)
                  }
                } else if (t.startsWith('s:')) {
                  const id = Number(t.slice(2))
                  names.push(artifactSetNames[id] ?? String(id))
                }
              }
              return names.join(', ')
            }
            // Build set list per order/search
            const entries = Object.entries(artifactSetNames) as Array<[string, string]>
            const filtered = setsSearch
              ? entries.filter(([, name]) => name.toLowerCase().includes(setsSearch.toLowerCase()))
              : entries
            const sorted = setsOrder === 'az'
              ? filtered.sort((a, b) => a[1].localeCompare(b[1]))
              : filtered.sort((a, b) => Number(a[0]) - Number(b[0]))

            const ALL_META_ID = 'meta__ALL_EXPLICIT'
            const allSets: number[] = Object.keys(artifactSetNames).map(Number)
            const metasetsMenu: Metaset[] = includeAllExplicitMeta
              ? ([{ id: ALL_META_ID, name: 'All (Explicit)', sets: allSets } as Metaset]).concat(metasets)
              : metasets

            return (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 520px) auto', gap: 1, alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
                <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 32, overflow: 'hidden' }}>
                  <Select
                    size="small"
                    multiple
                    value={selectedTokens}
                    onChange={handleChange}
                  renderValue={renderValue}
                  displayEmpty
                  sx={{
                    width: '100%',
                    minWidth: 0,
                    '& .MuiSelect-select': {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                      maxWidth: '100%'
                    },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        width: { xs: 'calc(100vw - 32px)', sm: 520 },
                        maxWidth: 520,
                        overflowX: 'hidden',
                      },
                    },
                    MenuListProps: {
                      sx: { width: '100%', maxWidth: '100%' },
                    },
                  }}
                >
                  <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Metasets</ListSubheader>
                  {metasetsMenu.map((m) => {
                    const setNames = m.sets.map((sid) => artifactSetNames[sid]).filter(Boolean)
                    const joined = setNames.join(', ')
                    const isAllExplicit = m.id === ALL_META_ID
                    return (
                      <MenuItem key={m.id} value={`m:${m.id}`}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                            <Typography noWrap>{m.name}</Typography>
                            {m.sets.length > 0 && (
                              <Typography variant="caption" sx={{ color: 'primary.main' }}>
                                ({m.sets.length} set(s))
                              </Typography>
                            )}
                          </Box>
                          {setNames.length > 0 && !isAllExplicit && (
                            <Typography
                              variant="caption"
                              sx={{ color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={joined}
                            >
                              {joined}
                            </Typography>
                          )}
                        </Box>
                      </MenuItem>
                    )
                  })}
                  <Divider sx={{ my: 0.3 }} />
                  <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Sets</ListSubheader>
                  {sorted.map(([id, name]) => {
                    const metaNames = metasets.filter(m => m.sets.includes(Number(id)) && m.id !== ALL_META_ID).map(m => m.name)
                    const joined = metaNames.join(', ')
                    return (
                      <MenuItem key={id} value={`s:${id}`}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <Typography>{name}</Typography>
                          {metaNames.length > 0 && (
                            <Typography
                              variant="caption"
                              sx={{ color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={joined}
                            >
                              {joined}
                            </Typography>
                          )}
                        </Box>
                      </MenuItem>
                    )
                  })}
                  </Select>
                </Box>
                <Button color="warning" onClick={() => setConfirmClearSets(true)}>Clear</Button>
              </Box>
            )
          })()}
        </FormControl>
        </Box>

      </Box>

        {/* Metasets dialog for managing groups */}
        <Dialog open={metaDlgOpen} onClose={() => setMetaDlgOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Manage Metasets</DialogTitle>
          <DialogContent dividers>
            {/* Shared search + order controls (same state as Sets) */}
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mb: 2 }}>
              <MuiTextField size="small" label="Search sets" value={setsSearch} onChange={(e) => setSetsSearch(e.target.value)} sx={{ width: 260 }} />
              <ToggleButtonGroup size="small" value={setsOrder} exclusive onChange={(_, v) => v && setSetsOrder(v)}>
                <ToggleButton value="game">Game</ToggleButton>
                <ToggleButton value="az">A–Z</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Named groups of sets. These appear at the top of the Sets selector.
            </Typography>
            <Stack spacing={1}>
              {metasets.map((m, idx) => (
                <Box key={m.id} sx={{ display: 'grid', gridTemplateColumns: '240px minmax(0,1fr) auto auto', gap: 1, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    label={`Metaset #${idx + 1}`}
                    value={m.name}
                    onChange={(e) => {
                      const next = metasets.map((x,i) => i===idx ? { ...x, name: e.target.value } : x)
                      onMetasetsChange(next)
                    }}
                  />
                  <Select
                    size="small"
                    multiple
                    fullWidth
                    value={m.sets.map(String)}
                    onChange={(e) => {
                      const ids = (e.target.value as string[]).map(Number)
                      const next = metasets.map((x,i) => i===idx ? { ...x, sets: ids } : x)
                      onMetasetsChange(next)
                    }}
                    renderValue={(selected) => selected.map((s) => artifactSetNames[Number(s)]).join(', ')}
                    MenuProps={{
                      PaperProps: { sx: { maxHeight: 340, width: { xs: 'calc(100vw - 32px)', sm: 520 }, maxWidth: 520, overflowX: 'hidden' } },
                      MenuListProps: { sx: { width: '100%', maxWidth: '100%' } },
                    }}
                    sx={{
                      minWidth: 0,
                      '& .MuiSelect-select': {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                      },
                    }}
                  >
                    {(() => {
                      const entries = Object.entries(artifactSetNames) as Array<[string, string]>
                      const filtered = setsSearch
                        ? entries.filter(([, name]) => name.toLowerCase().includes(setsSearch.toLowerCase()))
                        : entries
                      const sorted = setsOrder === 'az'
                        ? filtered.sort((a, b) => a[1].localeCompare(b[1]))
                        : filtered.sort((a, b) => Number(a[0]) - Number(b[0]))
                      return sorted.map(([id, name]) => {
                        const metaNames = metasets
                          .filter(x => x.sets.includes(Number(id)) && x.id !== m.id)
                          .map(x => x.name)
                        const joined = metaNames.join(', ')
                        return (
                          <MenuItem key={id} value={String(id)}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <Typography>{name}</Typography>
                              {metaNames.length > 0 && (
                                <Typography
                                  variant="caption"
                                  sx={{ color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  title={joined}
                                >
                                  {joined}
                                </Typography>
                              )}
                            </Box>
                          </MenuItem>
                        )
                      })
                    })()}
                  </Select>
                  <Button color="warning" onClick={() => setConfirmClearMetaId(m.id)}>Clear</Button>
                  <Button color="error" onClick={() => setConfirmDeleteMetaId(m.id)}>Delete</Button>
                </Box>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => onMetasetsChange(metasets.concat({ id: `meta_${Date.now()}`, name: 'New metaset', sets: [] }))}>Add metaset</Button>
            <FormControlLabel
              control={<Checkbox size="small" checked={includeAllExplicitMeta} onChange={(e) => onIncludeAllExplicitMetaChange(e.target.checked)} />}
              label='Add explicit metaset for "All"'
              title={'Adds an "All (Explicit)" metaset that lists all current sets explicitly (unlike "Any"). Useful so new game sets won\'t match old rules.'}
            />
            <Button size="small" variant="outlined" color="error" onClick={() => setConfirmResetMetasets(true)}>Reset to defaults</Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={() => setMetaDlgOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        {/* Confirm Clear Metaset */}
        <Dialog open={Boolean(confirmClearMetaId)} onClose={() => setConfirmClearMetaId(null)}>
          <DialogTitle>Clear sets from this metaset?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">This removes all gear sets from the metaset. The metaset itself remains.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmClearMetaId(null)}>Cancel</Button>
            <Button color="warning" onClick={() => {
              const id = confirmClearMetaId!
              setConfirmClearMetaId(null)
              const next = metasets.map(m => m.id === id ? { ...m, sets: [] } : m)
              onMetasetsChange(next)
            }}>Clear</Button>
          </DialogActions>
        </Dialog>

        {/* Confirm Delete Metaset */}
        <Dialog open={Boolean(confirmDeleteMetaId)} onClose={() => setConfirmDeleteMetaId(null)}>
          <DialogTitle>Delete this metaset?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">This removes the metaset and clears it from any rules that reference it.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDeleteMetaId(null)}>Cancel</Button>
            <Button color="error" onClick={() => {
              const id = confirmDeleteMetaId!
              setConfirmDeleteMetaId(null)
              onDeleteMetaset(id)
            }}>Delete</Button>
          </DialogActions>
        </Dialog>

        {/* Confirm Reset Metasets */}
        <Dialog open={confirmResetMetasets} onClose={() => setConfirmResetMetasets(false)}>
          <DialogTitle>Reset metasets to defaults?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">This replaces your metasets with defaults and clears their sets.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmResetMetasets(false)}>Cancel</Button>
            <Button color="error" onClick={() => { setConfirmResetMetasets(false); onMetasetsChange(defaultMetasets()) }}>Reset</Button>
          </DialogActions>
        </Dialog>

        {/* Minima manager dialog */}
        <Dialog open={minimaDlgOpen} onClose={() => setMinimaDlgOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Manage Minimum Substat Values</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Used when generating thresholds at each level.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Button size="small" onClick={() => setShowLowStarCols(s => !s)}>{showLowStarCols ? 'Hide 1–4★' : 'Show 1–4★'}</Button>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: `minmax(120px,1fr) repeat(${showLowStarCols ? 6 : 2}, 1fr)`, gap: 1, alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">Substat</Typography>
              <Typography variant="caption" color="text.secondary">6★</Typography>
              <Typography variant="caption" color="text.secondary">5★</Typography>
              {showLowStarCols && (
                <>
                  <Typography variant="caption" color="text.secondary">4★</Typography>
                  <Typography variant="caption" color="text.secondary">3★</Typography>
                  <Typography variant="caption" color="text.secondary">2★</Typography>
                  <Typography variant="caption" color="text.secondary">1★</Typography>
                </>
              )}
              {[
                { label: 'HP', id: 1, isFlat: true },
                { label: 'HP%', id: 1, isFlat: false },
                { label: 'ATK', id: 2, isFlat: true },
                { label: 'ATK%', id: 2, isFlat: false },
                { label: 'DEF', id: 3, isFlat: true },
                { label: 'DEF%', id: 3, isFlat: false },
                { label: 'SPD', id: 4, isFlat: true },
                { label: 'RES', id: 5, isFlat: true },
                { label: 'ACC', id: 6, isFlat: true },
                { label: 'CR%', id: 7, isFlat: false },
                { label: 'CDMG%', id: 8, isFlat: false },
              ].map(({ label, id, isFlat }) => {
                const key = `${id}:${isFlat}`
                return (
                  <React.Fragment key={`row-${key}`}>
                    <Typography sx={{ pr: 1 }}>{label}</Typography>
                    {/* 6-Star */}
                    <TextField
                      size="small"
                      type="number"
                      value={String((minima.six as any)[`${id}:${isFlat}`] ?? 0)}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        onMinimaChange({ ...minima, six: { ...minima.six, [`${id}:${isFlat}`]: v } })
                      }}
                    />
                    {/* 5-Star */}
                    <TextField
                      size="small"
                      type="number"
                      value={String((minima.five as any)[`${id}:${isFlat}`] ?? 0)}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        onMinimaChange({ ...minima, five: { ...minima.five, [`${id}:${isFlat}`]: v } })
                      }}
                    />
                    {showLowStarCols && (
                      <>
                        {/* 4-Star */}
                        <TextField
                          size="small"
                          type="number"
                          value={String((minima.four as any)[`${id}:${isFlat}`] ?? 0)}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            onMinimaChange({ ...minima, four: { ...minima.four, [`${id}:${isFlat}`]: v } })
                          }}
                        />
                        {/* 3-Star */}
                        <TextField
                          size="small"
                          type="number"
                          value={String((minima.three as any)[`${id}:${isFlat}`] ?? 0)}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            onMinimaChange({ ...minima, three: { ...minima.three, [`${id}:${isFlat}`]: v } })
                          }}
                        />
                        {/* 2-Star */}
                        <TextField
                          size="small"
                          type="number"
                          value={String((minima.two as any)[`${id}:${isFlat}`] ?? 0)}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            onMinimaChange({ ...minima, two: { ...minima.two, [`${id}:${isFlat}`]: v } })
                          }}
                        />
                        {/* 1-Star */}
                        <TextField
                          size="small"
                          type="number"
                          value={String((minima.one as any)[`${id}:${isFlat}`] ?? 0)}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            onMinimaChange({ ...minima, one: { ...minima.one, [`${id}:${isFlat}`]: v } })
                          }}
                        />
                      </>
                    )}
                  </React.Fragment>
                )
              })}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button size="small" variant="outlined" color="error" onClick={() => setConfirmResetMinima(true)}>Reset to defaults</Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={() => setMinimaDlgOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        {/* Confirm Reset Minima */}
        <Dialog open={confirmResetMinima} onClose={() => setConfirmResetMinima(false)}>
          <DialogTitle>Reset minima to defaults?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">This restores the recommended values from the documentation.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmResetMinima(false)}>Cancel</Button>
            <Button color="error" onClick={() => { setConfirmResetMinima(false); onMinimaChange(defaultMinima()) }}>Reset</Button>
          </DialogActions>
        </Dialog>

        {/* Confirm Clear Sets selection */}
        <Dialog open={confirmClearSets} onClose={() => setConfirmClearSets(false)}>
          <DialogTitle>Clear selected sets?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">This removes all selected sets and metasets for this rule.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmClearSets(false)}>Cancel</Button>
            <Button color="warning" onClick={() => { setConfirmClearSets(false); onChange({ ...cfg, artifactSets: [], artifactMetaSets: [] }) }}>Clear</Button>
          </DialogActions>
        </Dialog>

      

      {/* Choose substats moved up to be on the same row with main stat and min selected */}

      {/* Small separator above action buttons (matching the one below) */}
      <Divider sx={{ my: 1 }} />

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Button onClick={onAddToCustom}>{editingIndex !== null ? 'Insert after selected' : 'Add as new config'}</Button>
        <Button variant="outlined" color="inherit" onClick={onUpdateSelected} disabled={editingIndex === null}>Update selected config</Button>
        <Chip
          size="small"
          label={
            counting
              ? 'Counting…'
              : (ruleCount === null ? '—' : `${ruleCount} rule(s)`)
          }
          color={
            counting
              ? 'default'
              : (ruleCount === 0 ? 'error' : 'primary')
          }
          sx={{ ml: 0.5 }}
        />
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" color="error" onMouseEnter={() => setHoverReset(true)} onMouseLeave={() => setHoverReset(false)} onClick={() => setConfirmResetBuilder(true)}>Reset to defaults</Button>
        <Dialog open={confirmResetBuilder} onClose={() => setConfirmResetBuilder(false)}>
          <DialogTitle>Reset rule builder to defaults?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">This clears the current rule fields and selections.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmResetBuilder(false)}>Cancel</Button>
            <Button color="error" onClick={() => {
              setConfirmResetBuilder(false)
              onChange({
                ...cfg,
                keep: true,
                rankCode: 0,
                rarityCode: 0,
                factionCode: 0,
                name: '',
                mainStats: [],
                startLevel: 0,
                rollMode: 'auto',
                rollBaseline: 'afterStart',
                minCount: 0,
                autoMinCount: true,
                substats: [],
                fixedSubstats: [],
                substatRollBounds: undefined,
                artifactTypes: undefined,
                artifactSets: undefined,
                artifactMetaSets: undefined,
              })
            }}>Reset</Button>
          </DialogActions>
        </Dialog>
        {editingIndex !== null && (
          <Typography variant="caption" color="text.secondary">Editing config #{editingIndex + 1}</Typography>
        )}
      </Stack>
      <Divider sx={{ mt: 1 }} />
    </Box>
  )
}
