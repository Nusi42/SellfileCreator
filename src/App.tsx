import React, { useEffect, useMemo, useRef, useState } from 'react'
import { APP_VERSION } from './version'
import { parseHsfFile } from './lib/hsf'
import { formatArtifactTypes, rarityCodeToName, statNameFromId, statIsAny, statNameSort, formatRank, formatLevel, formatArtifactSets, formatMainStat, rankCodes, rarityCodes, rarityCodesFriendly, artifactTypeNames, artifactSetNames, factionCodeToName } from './lib/types'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { buildHsfRules, mainStatOptions, substatOptions, LEVELS, type BuilderConfig, defaultMinima, type MinimaTable } from './lib/hsfBuilder'
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
  const normalized: BuilderConfig = {
    name: typeof input.name === 'string' ? input.name : '',
    keep: Boolean(input.keep ?? true),
    rankCode,
    rarityCode,
    factionCode: typeof input.factionCode === 'number' ? input.factionCode : 0,
    mainStats: mainStatsArr,
    startLevel: [0,4,8,12,16].includes(input.startLevel) ? input.startLevel : 0,
    rollBaseline: input.rollBaseline === 'upToLevel' ? 'upToLevel' : 'afterStart',
    rollMode: (() => {
      const m = input.rollMode
      if (m === 'off' || m === 'strict' || m === 'potential') return m
      // derive from legacy flags if present, else default to potential
      if (input.generateRollPermutations === false) return 'off'
      if (input.potentialKeep === true) return 'potential'
      if (input.generateRollPermutations === true) return 'strict'
      return 'potential'
    })(),
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
      const out: Record<string, { min?: number; max?: number }> = {}
      for (const [k, v] of Object.entries(src)) {
        if (!v || typeof v !== 'object') continue
        const min = (v as any).min
        const max = (v as any).max
        const mv: { min?: number; max?: number } = {}
        if (typeof min === 'number' && min >= 0) mv.min = Math.floor(min)
        if (typeof max === 'number' && max >= 0) mv.max = Math.floor(max)
        if (mv.min !== undefined || mv.max !== undefined) out[k] = mv
      }
      return Object.keys(out).length ? out : undefined
    })(),
  }
  return normalized
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
// import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
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
  const [selectedCfgIdx, setSelectedCfgIdx] = useState<number | null>(null)
  const [metasets, setMetasets] = useState<Metaset[]>(defaultMetasets())
  const [minima, setMinima] = useState<MinimaTable>(defaultMinima())
  const [hoveredCfgIdx, setHoveredCfgIdx] = useState<number | null>(null)
  const [includeAllExplicitMeta, setIncludeAllExplicitMeta] = useState<boolean>(false)
  // Substat chip colors (persisted) — separate hex for text/border (fg) and background (bg)
  const DEFAULT_SUBSTAT_COLORS_FG: Record<number, string> = {
    1: '#90CAF9', // HP / HP% (light blue 300)
    2: '#CE93D8', // ATK / ATK% (purple 300)
    3: '#81C784', // DEF / DEF% (green 300)
    4: '#4FC3F7', // SPD (light blue 300)
    5: '#FFB74D', // RES (orange 300)
    6: '#B0BEC5', // ACC (blue-grey 300)
    7: '#66BB6A', // CR% (green 400)
    8: '#E57373', // CDMG% (red 300)
  }
  const DEFAULT_SUBSTAT_COLORS_BG: Record<number, string> = {
    1: '#152A3A', // dark blue tint for dark theme
    2: '#2A1C2F', // dark purple tint
    3: '#1A2F1E', // dark green tint
    4: '#143042', // dark cyan/light-blue tint
    5: '#3A2A15', // dark orange/brown tint
    6: '#233038', // dark blue-grey tint
    7: '#1B3320', // dark green tint
    8: '#3A1A1A', // dark red tint
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
  const COLORS_STORAGE_KEY_V3 = 'substatColors.v3'
  const COLORS_STORAGE_KEY_V2 = 'substatColors.v2'
  const COLORS_STORAGE_KEY_V1 = 'substatColors.v1'
  const defaultSubstatColorMapV3 = (): Record<string, { fg: string; bg: string }> => {
    const base: Record<string, { fg: string; bg: string }> = {}
    for (const id of [1,2,3,4,5,6,7,8]) {
      base[`${id}:1`] = { fg: DEFAULT_SUBSTAT_COLORS_FG[id], bg: DEFAULT_SUBSTAT_COLORS_BG[id] } // flat
      base[`${id}:0`] = { fg: DEFAULT_SUBSTAT_COLORS_FG[id], bg: DEFAULT_SUBSTAT_COLORS_BG[id] } // percent
    }
    // Slightly different defaults for % variants of HP/ATK/DEF
    base['1:0'].fg = '#64B5F6' // HP%
    base['2:0'].fg = '#BA68C8' // ATK%
    base['3:0'].fg = '#66BB6A' // DEF%
    return base
  }
  const [substatColors, setSubstatColors] = useState<Record<string, { fg: string; bg: string }>>(() => {
    try {
      // Try v3 (per variant fg+bg)
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
    try { localStorage.setItem(COLORS_STORAGE_KEY_V3, JSON.stringify(substatColors)) } catch {}
  }, [substatColors])
  const [colorsDlgOpen, setColorsDlgOpen] = useState(false)
  const chipsContainerRef = useRef<HTMLDivElement | null>(null)
  const [builder, setBuilder] = useState<BuilderConfig>({
    name: '',
    keep: true,
    rankCode: 0,
    rarityCode: 0,
    factionCode: 0,
    mainStats: [],
    startLevel: 0,
    rollBaseline: 'afterStart',
    rollMode: 'potential',
    substats: [],
    fixedSubstats: [],
    minCount: 0,
    autoMinCount: true,
  })
  // removed preview-generated rule count state for a cleaner UI
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)

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
    return base.concat(customs)
  }, [hsf, customCfgs, metasets, minima, includeAllExplicitMeta])

  // Scroll the selected config chip into the chips container without scrolling the page
  useEffect(() => {
    if (selectedCfgIdx === null) return
    const container = chipsContainerRef.current
    const el = document.getElementById(`cfg-chip-${selectedCfgIdx}`)
    if (container && el) {
      try {
        const targetTop = el.offsetTop - container.offsetTop
        container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
      } catch {}
    }
  }, [selectedCfgIdx, customCfgs.length])

  

  function onHsfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
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
      }
    }
    reader.readAsText(file)
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
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
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" fontWeight={700}>RSL Sellfile Creator</Typography>
        <Typography variant="caption" color="text.secondary">v{APP_VERSION}</Typography>
        <Typography variant="body2" color="text.secondary">
          Build and preview sell files for RSL Helper. Made by [STBL] Nusi㊷.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Unofficial utility — not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Remember: Bleibt Stabil!
        </Typography>
      </Box>

      

      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Base Sell File (.hsf)</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Optional: Load your existing RSL Helper sell file to preview how your new rules merge with it. You can skip this and still build and export rules from scratch.
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap' }}>
            <Button component="label">
              Load .hsf
              <input hidden type="file" accept=".hsf,application/json" onChange={onHsfUpload} />
            </Button>
            <Button color="warning" onClick={() => setHsf(null)} disabled={!hsf}>Clear base</Button>
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
              Drag & drop .hsf here
            </Box>
            {hsf && (
              <Typography variant="caption" color="text.secondary">
                {`Loaded ${hsf.Rules.length} base rules`}
              </Typography>
            )}
          </Stack>
        </Paper>

        

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Add Configs and Rules</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.25 }}>
            Use the builder below to define rules and add them to your custom set. You can also load/save your custom rules (HSFR), including metasets, and manage them right here.
          </Typography>
          <BuilderPanel
            cfg={builder}
            onChange={setBuilder}
            onAddToCustom={() => {
              setCustomCfgs(prev => {
                const next = prev.concat(builder)
                // Auto-select the newly added config chip
                setSelectedCfgIdx(next.length - 1)
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
            <Button component="label">
              Load .hsfr
              <input
                hidden
                type="file"
                accept=".hsfr,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    try {
                      const parsed = JSON.parse(String(reader.result))
                      const rawCfgs: any[] = Array.isArray(parsed)
                        ? parsed
                        : parsed.Configs ?? []
                      setCustomCfgs(rawCfgs.map(normalizeConfig))
                      if (!Array.isArray(parsed) && Array.isArray(parsed?.Metasets)) {
                        setMetasets(parsed.Metasets)
                      }
                      if (!Array.isArray(parsed) && parsed?.Minima) {
                        try { setMinima(parsed.Minima) } catch {}
                      }
                      if (!Array.isArray(parsed) && typeof parsed?.IncludeAllExplicitMeta === 'boolean') {
                        setIncludeAllExplicitMeta(parsed.IncludeAllExplicitMeta)
                      }
                    } catch (err) {
                      console.error('Failed to parse .hsfr file', err)
                    }
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
                    setCustomCfgs(rawCfgs.map(normalizeConfig))
                    if (!Array.isArray(parsed) && Array.isArray(parsed?.Metasets)) {
                      setMetasets(parsed.Metasets)
                    }
                    if (!Array.isArray(parsed) && parsed?.Minima) {
                      try { setMinima(parsed.Minima) } catch {}
                    }
                    if (!Array.isArray(parsed) && typeof parsed?.IncludeAllExplicitMeta === 'boolean') {
                      setIncludeAllExplicitMeta(parsed.IncludeAllExplicitMeta)
                    }
                  } catch (err) {
                    console.error('Failed to parse dropped .hsfr file', err)
                  }
                }
                reader.readAsText(file)
              }}
            >
              Drag & drop .hsfr here
            </Box>
            <Button
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
              }}
              // Always enabled: allow saving even with zero configs
              disabled={false}
            >
              Save .hsfr
            </Button>
            <Button color="error" onClick={() => setConfirmClearOpen(true)} disabled={!customCfgs.length}>Delete Configs</Button>
            <Chip label={`${customCfgs.length} config(s)`} size="small" />
          </Stack>
          {customCfgs.length > 0 && (
            <Box ref={chipsContainerRef} sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', maxHeight: 220, overflowY: 'auto', overflowX: 'hidden', pr: 1 }}>
              {customCfgs.map((c, idx) => (
                <ConfigChip
                  key={idx}
                  index={idx}
                  cfg={c}
                  metasets={metasets}
                  selected={selectedCfgIdx === idx}
                  onSelect={() => { setSelectedCfgIdx(idx); setBuilder(c) }}
                  onDelete={() => setConfirmDeleteIdx(idx)}
                  onDuplicate={() => setCustomCfgs(prev => prev.concat({ ...c, name: c.name ? `${c.name} (copy)` : undefined }))}
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
                  isLast={idx === customCfgs.length - 1}
                  linkedHover={hoveredCfgIdx !== null && hoveredCfgIdx === idx}
                  onHover={(enter) => setHoveredCfgIdx(enter ? idx : null)}
                />
              ))}
            </Box>
          )}
        </Paper>

        

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6">Merged Preview</Typography>
            <Chip label={`${mergedRules.length} total rule(s)`} size="small" />
            <Button size="small" variant="outlined" onClick={() => setColorsDlgOpen(true)}>Manage Colors...</Button>
            <Box sx={{ flex: 1 }} />
            <Button
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
              }}
              disabled={!mergedRules.length}
            >
              Download merged .hsf
            </Button>
          </Stack>
          {mergedRules.length ? (
            <HsfRulesTable
              rules={mergedRules}
              hoveredCfgIdx={hoveredCfgIdx}
              setHoveredCfgIdx={setHoveredCfgIdx}
              selectedCfgIdx={selectedCfgIdx}
              onSelectCfgIdx={(idx) => { setSelectedCfgIdx(idx); setBuilder(customCfgs[idx]) }}
              onConfigAction={(idx, action) => {
                if (action === 'select') { setSelectedCfgIdx(idx); setBuilder(customCfgs[idx]); return }
                if (action === 'duplicate') {
                  setCustomCfgs(prev => prev.concat({ ...prev[idx], name: prev[idx].name ? `${prev[idx].name} (copy)` : undefined }))
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
          ) : (
            <Typography variant="caption" color="text.secondary">Load a base .hsf and/or add custom rules to preview.</Typography>
          )}
        </Paper>

        <Box>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Unofficial fan-made tool; no endorsement implied. All trademarks are property of their respective owners.
          </Typography>
        </Box>
      </Stack>
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
  onConfigAction: (idx: number, action: 'select' | 'duplicate' | 'delete' | 'move_up' | 'move_down') => void;
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

  

  type ColKey = keyof HsfRule | 'Idx' | 'CfgIdx' | 'SubstatsSummary' | 'ArtifactTypeNames' | 'ArtifactSetNames' | 'RarityNames' | 'MainStatName' | 'RankLabel' | 'LevelLabel'
  type ColCfg = { key: ColKey; label: string; width: number; visible: boolean }
  const defaultCols: ColCfg[] = [
    { key: 'Idx', label: 'Idx', width: 72, visible: true },
    { key: 'CfgIdx', label: 'Cfg', width: 64, visible: true },
    { key: 'Keep', label: 'Keep', width: 64, visible: false },
    { key: 'Use', label: 'Use', width: 56, visible: false },
    { key: 'ArtifactSetNames', label: 'Sets', width: 180, visible: true },
    { key: 'ArtifactTypeNames', label: 'Slot', width: 100, visible: true },
    { key: 'RankLabel', label: 'Rank', width: 65, visible: true },
    { key: 'RarityNames', label: 'Rarity', width: 110, visible: true },
    { key: 'MainStatName', label: 'Main', width: 75, visible: true },
    { key: 'LevelLabel', label: 'Level', width: 75, visible: true },
    { key: 'Faction', label: 'Faction', width: 100, visible: true },
    { key: 'SubstatsSummary', label: 'Sub', width: 250, visible: true },
  ]
  const STORAGE_KEY = 'rulesTableCols.v1'
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
        const base = map.get(String(c.key))
        if (base) restored.push({ ...base, width: Number(c.width) || base.width, visible: Boolean(c.visible) })
      }
      // Append any missing defaults
      for (const d of defaultCols) if (!restored.find(x => x.key === d.key)) restored.push(d)
      return restored
    } catch { return defaultCols }
  })
  React.useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cols)) } catch {}
  }, [cols])

  // Row wrap toggle (persisted)
  const [wrapRows, setWrapRows] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(WRAP_ROWS_KEY)
      if (raw === 'true') return true
      if (raw === 'false') return false
    } catch {}
    return true // default to wrapping rows
  })
  React.useEffect(() => {
    try { localStorage.setItem(WRAP_ROWS_KEY, String(wrapRows)) } catch {}
  }, [wrapRows])

  // Recompute prefix sums when heights or rules length changes
  React.useEffect(() => {
    const n = rules.length
    if (rowHeightsRef.current.length !== n) {
      const fixed = 28
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

  const summarizeSubstats = (s: HsfRule['Substats']) => {
    const nonAny = s?.filter(Boolean)?.filter(x => !statIsAny(x.ID)).sort(statNameSort);
    const cond = (c?: string) => c === '>=' ? '≥' : c === '<=' ? '≤' : (c ?? '')
    return nonAny?.map((x) => `${ x.Condition === '¬' ? x.Condition : '' }${ statNameFromId(x.ID, x.IsFlat) } ${ (!x.Condition || x.Condition === '¬') ? '' : cond(x.Condition) } ${ (x.Condition === '>=' || x.Condition === '<=') ? x.Value : '' }`.trim()).join(' ∧ ');
  }

  const renderSubstatsInline = (s: HsfRule['Substats']) => {
    const nonAny = s?.filter(Boolean)?.filter(x => !statIsAny(x.ID)).sort(statNameSort);
    const cond = (c?: string) => c === '>=' ? '≥' : c === '<=' ? '≤' : (c ?? '')
    const defaultFg: Record<number, string> = { 1: '#90CAF9', 2: '#CE93D8', 3: '#81C784', 4: '#4FC3F7', 5: '#FFB74D', 6: '#B0BEC5', 7: '#66BB6A', 8: '#E57373' }
    const defaultBg: Record<number, string> = { 1: '#E3F2FD', 2: '#F3E5F5', 3: '#E8F5E9', 4: '#E1F5FE', 5: '#FFF3E0', 6: '#ECEFF1', 7: '#E8F5E9', 8: '#FFEBEE' }
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
                height: 16,
                borderColor: fg,
                color: fg,
                bgcolor: bg,
                '& .MuiChip-label': { px: 0.5, py: 0, fontSize: 10.5, lineHeight: 1.1 },
              }}
            />
          )
        })}
      </Box>
    )
  }

  return (
    <Box onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => { setIsHovering(false); setHoveredCfgIdx(null) }}>
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
                const keys = cols.filter(c => c.visible).map(c => c.key)
                const widths = new Map<ColKey, number>()
                // header labels baseline
                for (const c of cols.filter(c => c.visible)) {
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
                const visCols = cols.filter(c => c.visible)
                const sum = visCols.reduce((acc, c) => acc + (widths.get(c.key) || c.width), 0)
                let scale = sum > available ? available / sum : 1
                if (!Number.isFinite(scale) || scale <= 0) scale = 1
                const next = cols.map(c => {
                  if (!c.visible) return c
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
        <MenuItem onClick={(e) => {
          e.stopPropagation()
          // Preserve top visible row index when toggling modes
          const fixedRowH = 28
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
          setWrapRows(v => !v)
        }}>
          <Checkbox size="small" checked={wrapRows} />
          <Typography variant="body2" sx={{ minWidth: 140 }}>Allow multi-line rows</Typography>
          <Typography variant="caption" color="text.secondary">wrapRows</Typography>
        </MenuItem>
        <Divider />
        {cols.map((c, idx) => (
          <MenuItem key={String(c.key)} onClick={(e) => e.stopPropagation()}>
            <Checkbox size="small" checked={c.visible} onChange={(e) => setCols(prev => prev.map((x,i) => i===idx ? { ...x, visible: e.target.checked } : x))} />
            <Typography variant="body2" sx={{ minWidth: 140 }}>{c.label}</Typography>
            <Typography variant="caption" color="text.secondary">{String(c.key)}</Typography>
          </MenuItem>
        ))}
      </Menu>
      {(() => {
        const visibleCols = cols.filter(c => c.visible)
        const totalVisibleWidth = visibleCols.reduce((sum, c) => sum + (c.width || 0), 0)
        const needHScroll = totalVisibleWidth > containerW && containerW > 0
        return (
          <TableContainer ref={tableContainerRef} sx={{ maxHeight: 960, overflowX: needHScroll ? 'auto' : 'hidden' }}>
            <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHead>
              <TableRow>
                {cols.filter(c => c.visible).map((c) => {
                  const realIdx = cols.findIndex(x => x.key === c.key)
                  const width = c.width
                  return (
                  <TableCell
                    key={String(c.key)}
                    sx={{
                      fontWeight: 600,
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
                const visibleCols = cols.filter(c => c.visible)
                const colSpan = Math.max(1, visibleCols.length)
                const fixedRowH = 28 // px; single-line dense height
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
                        {cols.filter(c => c.visible).map((c) => {
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
                                fontSize: 12,
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
            <MenuItem onClick={() => { onConfigAction(menu!.cfgIdx!, 'select'); setMenu(null) }}>Select config</MenuItem>
            <MenuItem onClick={() => { onConfigAction(menu!.cfgIdx!, 'duplicate'); setMenu(null) }}>Duplicate config</MenuItem>
            <MenuItem onClick={() => { onConfigAction(menu!.cfgIdx!, 'move_up'); setMenu(null) }}>Move up</MenuItem>
            <MenuItem onClick={() => { onConfigAction(menu!.cfgIdx!, 'move_down'); setMenu(null) }}>Move down</MenuItem>
            <MenuItem onClick={() => { onConfigAction(menu!.cfgIdx!, 'delete'); setMenu(null) }}>Delete config</MenuItem>
            {/* <MenuItem onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(menu!.rule, null, 2)) } catch {} setMenu(null) }}>Copy rule for RSL Helper</MenuItem> */}
          </>
        )}
        {menu?.cfgIdx === undefined && (
          <>
            <MenuItem onClick={() => { onClearBase(); setMenu(null) }}>Clear base</MenuItem>
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
            const fixedRowH = 28
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
  selected: boolean
  onSelect: () => void
  isLast: boolean
  linkedHover: boolean
  onHover: (enter: boolean) => void
  metasets: Metaset[]
}) {
  const ellipsizeName = (s: string, max = 20) => (s.length <= max ? s : s.slice(0, max - 1) + '…')
  const label = `${index + 1}. ${cfg.name ? `${ellipsizeName(cfg.name)} — ${summaryOf(cfg, metasets)}` : summaryOf(cfg, metasets)}`
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
      title="Click to edit this config"
    >
      <Typography variant="caption" sx={{ mr: 0.5 }}>{label}</Typography>
      <Tooltip title="Move up"><span><IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveUp() }} disabled={index === 0}><ArrowUpwardIcon fontSize="inherit" /></IconButton></span></Tooltip>
      <Tooltip title="Move down"><span><IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveDown() }} disabled={isLast}><ArrowDownwardIcon fontSize="inherit" /></IconButton></span></Tooltip>
      <Tooltip title="Duplicate"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onDuplicate() }}><ContentCopyIcon fontSize="inherit" /></IconButton></Tooltip>
      <Tooltip title="Delete"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete() }} color="error"><DeleteIcon fontSize="inherit" /></IconButton></Tooltip>
    </Box>
  )
}

function summaryOf(cfg: BuilderConfig, metasets: Metaset[]): string {
  const parts: string[] = []
  const ellipsize = (s: string, max = 20) => (s.length <= max ? s : s.slice(0, max - 1) + '…')
  const push = (label: string, value: string) => parts.push(`${label}:${ellipsize(value)}`)

  push('Act', cfg.keep ? 'Keep' : 'Sell')
  push('Rank', formatRank(cfg.rankCode) || 'Any')
  push('Rar', rarityCodeToName(cfg.rarityCode) || 'Any')
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

  // Required substats indicator
  push('Req', cfg.autoMinCount ? 'Auto' : String(cfg.minCount))
  if (cfg.rollMode === 'potential') push('PK', 'on')

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

        <FormControl sx={{ gridColumn: '1 / -1' }}>
          <FormLabel sx={{ mb: 0.5 }}>Action</FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
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
          </Box>
        </FormControl>

        {/* Row 2: Left half (Rank, Rarity, Faction) */}
        <Box sx={{ gridColumn: '1 / 3', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', columnGap: 1, rowGap: 2 }}>
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
        <Box sx={{ gridColumn: '3 / 5', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
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
              onChange={(_, v) => v && update('startLevel', Number(v) as any)}
              sx={{ height: 40 }}
            >
              {LEVELS.map((l) => (
                <ToggleButton key={l} value={String(l)}>+{l}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </FormControl>

        <FormControl>
          <FormLabel sx={{ mb: 0.5 }} title="Strategy: Off (start only), Strict (+4/+8/+12/+16), Potential (strict + early relaxed keeps).">Roll Strategy</FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.rollMode}
              onChange={(_, v) => { if (!v) return; update('rollMode', v) }}
              sx={{ height: 40 }}
            >
              <ToggleButton value="off">Off</ToggleButton>
              <ToggleButton value="strict">Strict</ToggleButton>
              <ToggleButton value="potential">Potential</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </FormControl>
        </Box>
        {/* Row 3: Mainstat (left), Substats (right) */}
        <FormControl sx={{ gridColumn: '1 / 3' }}>
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

        <FormControl sx={{ gridColumn: '3 / 5' }}>
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
              const setBounds = (id: number, isFlat: boolean | undefined, b?: { min?: number; max?: number }) => {
                const key = keyOf(id, isFlat)
                const next = { ...(cfg.substatRollBounds ?? {}) }
                if (!b || (b.min === undefined && b.max === undefined)) delete next[key]
                else next[key] = b
                onChange({ ...cfg, substatRollBounds: Object.keys(next).length ? next : undefined })
              }
              const cycleMin = (id: number, isFlat?: boolean, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(id, isFlat)
                const curMin = Math.max(0, Math.min(5, Number(b?.min ?? 0)))
                const nextMin = (curMin + 1) % 6
                if (nextMin === 0) {
                  const keepMax0 = b?.max === 0
                  setBounds(id, isFlat, keepMax0 ? { max: 0 } : undefined)
                } else {
                  setBounds(id, isFlat, { min: nextMin })
                }
              }
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
                  onChange({ ...cfg, substats: next, minCount: nextMin })
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
                const min = Math.max(0, Math.min(5, Number(b?.min ?? 0)))
                const isUnrolledOnly = b?.max === 0 && (b?.min === undefined || b.min === 0)
                const disabled = cfg.rollMode === 'off'
                const selected = isSelected(id, isFlat)
                const title = disabled
                  ? 'Enable Roll permutations to constrain rolls'
                  : (cfg.rollBaseline === 'upToLevel' ? 'Rolls include prior levels (right-click for more)' : 'Rolls after start (right-click for more)')
                return (
                  <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: selected ? 'flex-start' : 'center', pointerEvents: 'none' }}>
                    <Box component="span" sx={{ pointerEvents: 'none', pl: selected ? 0.75 : 0.25, pr: selected ? 3.5 : 0.5, textAlign: selected ? 'left' : 'center', width: '100%' }}>{label}</Box>
                    {/* Lock indicator overlay (visual only) */}
                    <Box sx={{ position: 'absolute', top: -8, left: -8, opacity: isFixed(id, isFlat) ? 0.9 : 0, transition: 'opacity .15s', pointerEvents: 'none', zIndex: 3 }}>
                      <LockIcon sx={{ fontSize: 14 }} />
                    </Box>
                    {/* Rolls circle overlay (independent of lock position) */}
                    <Box
                      role="button"
                      onClick={(e) => { if (!isSelected(id, isFlat)) return; cycleMin(id, isFlat, e) }}
                      // Context menu disabled for now
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
                        opacity: (!isSelected(id, isFlat)) ? 0 : (disabled ? 0.5 : (min === 0 && !isUnrolledOnly ? 0.5 : 1)),
                        pointerEvents: isSelected(id, isFlat) ? 'auto' : 'none',
                        border: '1px solid',
                        borderStyle: isUnrolledOnly ? 'dashed' : 'solid',
                        borderColor: 'text.secondary',
                        color: 'text.primary',
                        bgcolor: (min >= 1) ? 'action.selected' : 'transparent',
                        zIndex: 2,
                      }}
                    >
                      {min}
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
                  Click to select; click again to lock (🔒). Locked substats are always included. Right badge is roll count: click to cycle 0–5.
                </Typography>
              </Box>
              {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
              <ToggleButtonGroup size="small" value={value} onChange={() => {}} sx={{ gap: 0.5, '& .MuiToggleButton-root': { px: 0.5, minWidth: 88, width: 88, height: 36, justifyContent: 'center', position: 'relative' } }}>
                <ToggleButton value="1:1" onClick={(e)=>cycleSubstat(1, true, e)}><BtnContent label="HP" id={1} isFlat /></ToggleButton>
                <ToggleButton value="1:0" onClick={(e)=>cycleSubstat(1, false, e)}><BtnContent label="HP%" id={1} isFlat={false} /></ToggleButton>
                <ToggleButton value="2:1" onClick={(e)=>cycleSubstat(2, true, e)}><BtnContent label="ATK" id={2} isFlat /></ToggleButton>
                <ToggleButton value="2:0" onClick={(e)=>cycleSubstat(2, false, e)}><BtnContent label="ATK%" id={2} isFlat={false} /></ToggleButton>
                <ToggleButton value="3:1" onClick={(e)=>cycleSubstat(3, true, e)}><BtnContent label="DEF" id={3} isFlat /></ToggleButton>
                <ToggleButton value="3:0" onClick={(e)=>cycleSubstat(3, false, e)}><BtnContent label="DEF%" id={3} isFlat={false} /></ToggleButton>
              </ToggleButtonGroup>
              {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
              <ToggleButtonGroup size="small" value={value} onChange={() => {}} sx={{ gap: 0.5, '& .MuiToggleButton-root': { px: 0.5, minWidth: 88, width: 88, height: 36, justifyContent: 'center', position: 'relative' } }}>
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
        <FormControl sx={{ gridColumn: '1 / 3' }}>
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
        <Box sx={{ gridColumn: '3 / 5', display: 'grid', rowGap: 1 }}>
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
        <Button onClick={onAddToCustom}>Add as new config</Button>
        <Button variant="outlined" color="inherit" onClick={onUpdateSelected} disabled={editingIndex === null}>Update selected config</Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" color="error" onClick={() => setConfirmResetBuilder(true)}>Reset to defaults</Button>
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
                mainStats: [],
                startLevel: 0,
                rollMode: 'potential',
                minCount: 0,
                autoMinCount: true,
                substats: [],
                fixedSubstats: [],
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
