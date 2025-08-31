import React, { useEffect, useMemo, useRef, useState } from 'react'
import { rarityCodeToName, formatRank, artifactTypeNames, artifactSetNames, factionCodeToName, artifactSetName, ArtifactType, StatId, formatSubstat, mainToVariant, subToVariant, variantToMain, variantToSub, RankCode, RarityCode, Faction, StatVariant } from '../lib/types'
import MetasetsDialog from './MetasetsDialog'
import { buildHsfRules, LEVELS, type BuilderConfig, type MinimaTable } from '../lib/hsfBuilder'
import { findObsoleteRules } from '../lib/hsfObsolete'
import { type Metaset } from '../lib/metasets'

type ExtCfg = BuilderConfig & {
  mainStatVariants?: StatVariant[]
  substatVariants?: StatVariant[]
  fixedSubstatVariants?: StatVariant[]
  substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }>
}

//

import { Box, Button, Divider, Stack, Typography, TextField, Chip, FormControl, FormLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, ListSubheader, Popover } from '@mui/material'
import MinimaDialog from './MinimaDialog'
import type { SelectChangeEvent } from '@mui/material/Select'
import { IconButton, Tooltip, ToggleButton, ToggleButtonGroup, TextField as MuiTextField } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import GavelIcon from '@mui/icons-material/Gavel'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import ShieldIcon from '@mui/icons-material/Shield'
import BackHandIcon from '@mui/icons-material/BackHand'
import CheckroomIcon from '@mui/icons-material/Checkroom'
import HikingIcon from '@mui/icons-material/Hiking'
import DiamondIcon from '@mui/icons-material/Diamond'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import FlagIcon from '@mui/icons-material/Flag'
import EllipsisTooltip from './EllipsisTooltip'
import LockIcon from '@mui/icons-material/Lock'
export default function BuilderPanel({ cfg, onChange, onAddToCustom, editingIndex, onUpdateSelected, metasets, onMetasetsChange, onDeleteMetaset, minima, onMinimaChange, includeAllExplicitMeta, onIncludeAllExplicitMetaChange, setUsageCounts, metasetUsageCounts }: {
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
  setUsageCounts: Record<number, number>
  metasetUsageCounts: Record<string, number>
}) {
  const update = <K extends keyof BuilderConfig>(k: K, v: BuilderConfig[K]) => onChange({ ...cfg, [k]: v })
  // Help flyout for Count Rolls / Evaluate From / Roll Strategy / Required Substats
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null)
  const [setsOrder, setSetsOrder] = useState<'game' | 'az'>('game')
  const [setsSearch, setSetsSearch] = useState('')
  const [metaDlgOpen, setMetaDlgOpen] = useState(false)
  const [metaSetsMenuOpen, setMetaSetsMenuOpen] = useState(false)
  const [confirmClearSets, setConfirmClearSets] = useState(false)
  const [minimaDlgOpen, setMinimaDlgOpen] = useState(false)
  
  const [confirmResetBuilder, setConfirmResetBuilder] = useState(false)

  
  const setsLeftRef = useRef<HTMLDivElement | null>(null)
  const [setsLeftWidth, setSetsLeftWidth] = useState<number>(0)
  // Subtle highlight of controls affected by Reset when hovering the button
  const [hoverReset, setHoverReset] = useState(false)
  // Debounced rule count for the current builder config
  const [ruleCount, setRuleCount] = useState<number | null>(null)
  const [counting, setCounting] = useState<boolean>(false)
  const countTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  // Only recompute when fields that influence rule generation change (exclude name)
  const countDeps = useMemo(() => ({
    keep: cfg.keep,
    enabled: cfg.enabled,
    Rank: formatRank(cfg.rankCode),
    Rarity: rarityCodeToName(cfg.rarityCode),
    factionCode: cfg.factionCode,
    mainStats: cfg.mainStats,
    startLevel: cfg.startLevel,
    rollBaseline: cfg.rollBaseline,
    rollMode: cfg.rollMode,
    substats: cfg.substats,
    fixedSubstats: cfg.fixedSubstats,
    minCount: cfg.minCount,
    autoMinCount: cfg.autoMinCount,
    artifactTypeNames: (cfg.artifactTypes ?? []).map(t => artifactTypeNames[Number(t)]).filter(Boolean),
    artifactSetNames: (cfg.artifactSets ?? []).map(sv => artifactSetNames[Number(sv)]).filter(Boolean),
    artifactMetaSets: cfg.artifactMetaSets,
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
  }), [
    cfg.keep,
    cfg.enabled,
    cfg.rankCode,
    cfg.rarityCode,
    cfg.factionCode,
    cfg.mainStats,
    cfg.startLevel,
    cfg.rollBaseline,
    cfg.rollMode,
    cfg.substats,
    cfg.fixedSubstats,
    cfg.minCount,
    cfg.autoMinCount,
    cfg.artifactTypes,
    cfg.artifactSets,
    cfg.artifactMetaSets,
    cfg.substatRollBounds,
  ])
  useEffect(() => {
    // Debounce to avoid blocking typing/interactions
    if (countTimerRef.current) { clearTimeout(countTimerRef.current); countTimerRef.current = null }
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
    countTimerRef.current = id
    return () => { if (countTimerRef.current) { clearTimeout(countTimerRef.current); countTimerRef.current = null } }
  }, [countDeps, minima, cfg])
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

  // Local draft for rule name to keep typing snappy; sync upstream with debounce
  const [nameDraft, setNameDraft] = useState<string>(cfg.name ?? '')
  useEffect(() => { setNameDraft(cfg.name ?? '') }, [cfg.name])

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
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => { if (nameDraft !== (cfg.name ?? '')) update('name', nameDraft) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title="Enable this config. When off, the rules are still exported but ignored by RSL Helper. Disabled rules show a white strikethrough in preview and on the chip (Keep/Sell)."><span>Action</span></Tooltip></FormLabel>
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
            {(() => {
              const isEnabled = cfg.enabled !== false
              return (
                <Tooltip title={isEnabled ? 'Enabled in Sellfile: rules are active' : 'Disabled in Sellfile: exported but ignored by RSL Helper'}>
                  <Button
                    size="small"
                    variant={isEnabled ? 'contained' : 'outlined'}
                    color={isEnabled ? 'success' : 'warning'}
                    sx={{ minWidth: 160, ml: 1 }}
                    startIcon={isEnabled ? <VisibilityIcon /> : <VisibilityOffIcon />}
                    onClick={() => update('enabled', !isEnabled)}
                  >
                    {isEnabled ? 'Enabled in Sellfile' : 'Disabled in Sellfile'}
                  </Button>
                </Tooltip>
              )
            })()}
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title="Choose exact stars or ranges like '≥ 5★' or '≤ 6★'. 'Any' matches all. Thresholds adjust conservatively."><span>Rank</span></Tooltip></FormLabel>
          <Select
            size="small"
            value={String(cfg.rankCode)}
            onChange={(e: SelectChangeEvent<string>) => update('rankCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
          >
            <MenuItem value={String(0)}>{formatRank(0) || 'Any'}</MenuItem>
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Exact</ListSubheader>
            {[RankCode.One,RankCode.Two,RankCode.Three,RankCode.Four,RankCode.Five,RankCode.Six].map((code) => (
              <MenuItem key={code} value={String(code)}>{formatRank(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>≥ Ranges</ListSubheader>
            {[RankCode.GTE_One,RankCode.GTE_Two,RankCode.GTE_Three,RankCode.GTE_Four,RankCode.GTE_Five].map((code) => (
              <MenuItem key={code} value={String(code)}>{formatRank(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>≤ Ranges</ListSubheader>
            {[RankCode.LTE_Two,RankCode.LTE_Three,RankCode.LTE_Four,RankCode.LTE_Five,RankCode.LTE_Six].map((code) => (
              <MenuItem key={code} value={String(code)}>{formatRank(code)}</MenuItem>
            ))}
          </Select>
          
        </FormControl>

        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title="Pick an exact rarity or a range. For ranges, roll behavior uses a strict assumption (similar to Legendary/Mythical)."><span>Rarity</span></Tooltip></FormLabel>
          <Select
            size="small"
            value={String(cfg.rarityCode)}
            onChange={(e: SelectChangeEvent<string>) => update('rarityCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
          >
            <MenuItem value={String(0)}>{rarityCodeToName(0) || 'Any'}</MenuItem>
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Exact</ListSubheader>
            {[RarityCode.Common,RarityCode.Uncommon,RarityCode.Rare,RarityCode.Epic,RarityCode.Legendary,RarityCode.Mythical].map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>≥ Ranges</ListSubheader>
            {[RarityCode.GTE_Common,RarityCode.GTE_Uncommon,RarityCode.GTE_Rare,RarityCode.GTE_Epic,RarityCode.GTE_Legendary].map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>≤ Ranges</ListSubheader>
            {[RarityCode.LTE_Uncommon,RarityCode.LTE_Rare,RarityCode.LTE_Epic,RarityCode.LTE_Legendary,RarityCode.LTE_Mythical].map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code)}</MenuItem>
            ))}
          </Select>
          
        </FormControl>

        {/* Faction selection (accessories only) */}
        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title="Applies to accessories (Ring, Amulet, Banner). Other gear ignores faction."><span>Faction</span></Tooltip></FormLabel>
          <Select
            size="small"
            value={String(cfg.factionCode ?? 0)}
            onChange={(e: SelectChangeEvent<string>) => update('factionCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
          >
            <MenuItem value={String(0)}>Any</MenuItem>
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Telerian League</ListSubheader>
            {[Faction.BannerLords,Faction.HighElves,Faction.SacredOrder,Faction.Barbarians].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Gaellen Pact</ListSubheader>
            {[Faction.OgrynTribes,Faction.Lizardmen,Faction.Skinwalkers,Faction.Orcs].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>The Corrupted</ListSubheader>
            {[Faction.Demonspawn,Faction.UndeadHordes,Faction.DarkElves,Faction.KnightRevenant].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Nyresan Union</ListSubheader>
            {[Faction.Dwarves,Faction.Shadowkin,Faction.SylvanWatchers].map((code) => (
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={'From: count rolls after "Evaluate From". All: include prior rolls up to each level.'}><span>Count Rolls</span></Tooltip></FormLabel>
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title="First level to check thresholds."><span>Evaluate From</span></Tooltip></FormLabel>
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
                const num = Number(v)
                if ([0,4,8,12,16].includes(num)) update('startLevel', num as 0|4|8|12|16)
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
            <FormLabel> <Tooltip title="Strategy: Off (ignores badges), Strict (only fully feasible at each level), Potential (allow progress & strict once feasible), Auto (Strict when no substats are selected; Potential otherwise)."><span>Roll Strategy</span></Tooltip> </FormLabel>
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title="Select one or more main stats. Selecting none equals Any. HP/ATK/DEF can be flat or percent."><span>Mainstat</span></Tooltip></FormLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              const encode = (id: number, f?: number) => `${id}:${f ?? ''}`
              const value: string[] = (() => {
    const vars = (cfg as ExtCfg).mainStatVariants
                if (Array.isArray(vars) && vars.length > 0) return vars.map(v => { const m = variantToMain(v); return encode(m.id, m.f) })
                return (cfg.mainStats?.length ?? 0) === 0 ? ['any'] : (cfg.mainStats ?? []).map(s => encode(s.id, s.f))
              })()
              const handleChange = (_: React.SyntheticEvent, v: string[]) => {
                if (!Array.isArray(v)) return
                const prevHadAny = ((((cfg as ExtCfg).mainStatVariants?.length ?? cfg.mainStats?.length) ?? 0) === 0)
                const hasAny = v.includes('any')
                const others = v.filter(x => x !== 'any')

                if (others.length === 0) {
                  // Any
                  onChange({ ...cfg, mainStats: [], mainStatVariants: [] as StatVariant[] })
                  return
                }

                if (hasAny) {
                  if (prevHadAny) {
                    const next = others.map(token => {
                      const [idStr, fStr] = String(token).split(':')
                      const id = Number(idStr)
                      if (fStr !== '') return { id, f: Number(fStr) }
                      return { id }
                    })
                    const vars = next.map(ms => mainToVariant(ms.id, ms.f)) as StatVariant[]
                    onChange({ ...cfg, mainStats: next, mainStatVariants: vars })
                  } else {
                    onChange({ ...cfg, mainStats: [], mainStatVariants: [] as StatVariant[] })
                  }
                  return
                }

                const next = others.map(token => {
                  const [idStr, fStr] = String(token).split(':')
                  const id = Number(idStr)
                  if (fStr !== '') return { id, f: Number(fStr) }
                  return { id }
                })
                const vars = next.map(ms => mainToVariant(ms.id, ms.f)) as StatVariant[]
                onChange({ ...cfg, mainStats: next, mainStatVariants: vars })
              }
              return (
                <>
                  {/* Row 1: Any */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: 144, height: 36 } }}>
                    <ToggleButton value="any">Any</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ gap: 0.5, '& .MuiToggleButton-root': { px: 0.75, minWidth: 72, width: 72, height: 36, justifyContent: 'center' } }}>
                    <ToggleButton value={`${StatId.HP}:1`}>HP</ToggleButton>
                    <ToggleButton value={`${StatId.HP}:0`}>HP%</ToggleButton>
                    <ToggleButton value={`${StatId.ATK}:1`}>ATK</ToggleButton>
                    <ToggleButton value={`${StatId.ATK}:0`}>ATK%</ToggleButton>
                    <ToggleButton value={`${StatId.DEF}:1`}>DEF</ToggleButton>
                    <ToggleButton value={`${StatId.DEF}:0`}>DEF%</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ gap: 0.5, '& .MuiToggleButton-root': { px: 0.75, minWidth: 72, width: 72, height: 36, justifyContent: 'center' } }}>
                    <ToggleButton value={`${StatId.SPD}:`}>SPD</ToggleButton>
                    <ToggleButton value={`${StatId.RES}:1`}>RES</ToggleButton>
                    <ToggleButton value={`${StatId.ACC}:1`}>ACC</ToggleButton>
                    <ToggleButton value={`${StatId.CR}:0`}>CR%</ToggleButton>
                    <ToggleButton value={`${StatId.CDMG}:0`}>CDMG%</ToggleButton>
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title="Select substats to target; set the minimum above. Choose ‘Any’ to allow any substats (equivalent to selecting none)."><span>Substats</span></Tooltip></FormLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              type ExtCfg = BuilderConfig & { mainStatVariants?: StatVariant[]; substatVariants?: StatVariant[]; fixedSubstatVariants?: StatVariant[]; substatRollBoundsV?: Record<number, {min?:number; max?:number; any?:boolean}> }
              const ext = cfg as ExtCfg
              const encode = (id: number, isFlat?: boolean) => `${id}:${isFlat ? 1 : 0}`
              const keyOf = (id: number, isFlat?: boolean) => `${id}:${Boolean(isFlat)}`
              const value: string[] = (() => {
    const vars = ext.substatVariants
                if (Array.isArray(vars) && vars.length > 0) return vars.map(v => { const o = variantToSub(v); return encode(o.id, o.isFlat) })
                return (cfg.substats?.length ?? 0) === 0 ? ['any'] : cfg.substats.map(s => encode(s.id, s.isFlat))
              })()
              const isSelected = (id: number, isFlat?: boolean) => {
                const vars = ext.substatVariants as StatVariant[] | undefined
                if (Array.isArray(vars) && vars.length > 0) return vars.some((v) => { const o = variantToSub(v); return o.id === id && Boolean(o.isFlat) === Boolean(isFlat) })
                return cfg.substats.some(s => s.id === id && Boolean(s.isFlat) === Boolean(isFlat))
              }
              const isFixed = (id: number, isFlat?: boolean) => {
    const fvars = ext.fixedSubstatVariants
                if (Array.isArray(fvars) && fvars.length > 0) return fvars.some(v => { const o = variantToSub(v); return o.id === id && Boolean(o.isFlat) === Boolean(isFlat) })
                return (cfg.fixedSubstats ?? []).some(s => s.id === id && Boolean(s.isFlat) === Boolean(isFlat))
              }
              const getBounds = (id: number, isFlat?: boolean) => {
                const v = subToVariant(id, isFlat)
                return (ext.substatRollBoundsV)?.[v] ?? (cfg.substatRollBounds ?? {})[keyOf(id, isFlat)]
              }
              const setBounds = (id: number, isFlat: boolean | undefined, bounds?: { min?: number; max?: number; any?: boolean }) => {
                const key = keyOf(id, isFlat)
                const vKey = subToVariant(id, isFlat) as number
                const prevLegacy = (cfg.substatRollBounds ?? {}) as Record<string, { min?: number; max?: number; any?: boolean }>
                const prevVariant = (ext.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
                const isEmpty = !bounds || (bounds.min === undefined && bounds.max === undefined && !('any' in bounds && bounds.any))
                let nextLegacy: Record<string, { min?: number; max?: number; any?: boolean }> | undefined
                let nextVariant: Record<number, { min?: number; max?: number; any?: boolean }> | undefined
                if (isEmpty) {
                  const { [key]: _omit, ...rest } = prevLegacy
                  nextLegacy = Object.keys(rest).length ? rest : undefined
                  const { [vKey]: _omitV, ...restV } = prevVariant
                  nextVariant = Object.keys(restV).length ? restV : undefined
                } else {
                  nextLegacy = { ...prevLegacy, [key]: bounds }
                  nextVariant = { ...prevVariant, [vKey]: bounds }
                }
                onChange({
                  ...cfg,
                  ...(nextLegacy ? { substatRollBounds: nextLegacy } : {}),
                  ...(nextVariant ? { substatRollBoundsV: nextVariant } : {}),
                })
              }
              // No unset: default is star (any).
              // Left click cycles Min (*,1..5,*). Shift-click cycles Max (*,0..5,*).
              // Right click cycles backwards (Min: *→5→…→1→*; Max: *→5→…→0→*).
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

              const cycleMinBack = (id: number, isFlat?: boolean, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(id, isFlat)
                const isAny = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const curMin = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                if (isAny) {
                  // ★ -> 5 (Min)
                  setBounds(id, isFlat, { min: 5 })
                } else if (hasMin && curMin > 1) {
                  // 2..5 -> -1; 1 handled below
                  setBounds(id, isFlat, { min: curMin - 1 })
                } else {
                  // 1 or none -> ★
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
              const cycleMaxBack = (id: number, isFlat?: boolean, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(id, isFlat)
                const isAny = Boolean(b?.any)
                const hasMax = typeof b?.max === 'number'
                const curMax = hasMax ? Math.max(0, Math.min(5, Number(b?.max))) : 0
                if (isAny) {
                  // ★ -> 5 (Max)
                  setBounds(id, isFlat, { max: 5 })
                } else if (hasMax && curMax > 0) {
                  // 1..5 -> -1; 0 handled below
                  setBounds(id, isFlat, { max: curMax - 1 })
                } else {
                  // 0 or none -> ★
                  setBounds(id, isFlat, { any: true })
                }
              }
              
              const cycleSubstat = (id: number, isFlat?: boolean, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                
                const selected = isSelected(id, isFlat)
                const fixed = isFixed(id, isFlat)
                if (!selected) {
                  const selVar = subToVariant(id, isFlat)
                  const curVars = (ext.substatVariants as StatVariant[] | undefined) ?? cfg.substats.map(s => subToVariant(s.id, s.isFlat))
                  const nextVars = curVars.concat(selVar)
                  const next = nextVars.map(v => variantToSub(v))
                  const nextMin = (cfg.autoMinCount ? Math.min(4, next.length) : ((cfg.minCount === 0 && next.length > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                  const key = `${id}:${Boolean(isFlat)}`
                  const b = { ...(cfg.substatRollBounds ?? {}) }
                  // New selection starts as ★ (wildcard)
                  b[key] = { any: true }
                  const pruned = Object.keys(b).length ? b : {}
                  onChange({ ...cfg, substats: next, substatVariants: nextVars as StatVariant[], minCount: nextMin, substatRollBounds: pruned })
                  return
                }
                if (selected && !fixed) {
                  const selVar = subToVariant(id, isFlat)
                  const curFixedVars = (ext.fixedSubstatVariants as StatVariant[] | undefined) ?? (cfg.fixedSubstats ?? []).map(s => subToVariant(s.id, s.isFlat))
                  const nextFixedVars = curFixedVars.concat(selVar)
                  const nextFixed = nextFixedVars.map(v => variantToSub(v))
                  onChange({ ...cfg, fixedSubstats: nextFixed, fixedSubstatVariants: nextFixedVars as StatVariant[] })
                  return
                }
                // was fixed -> remove entirely
                const curVars = (ext.substatVariants as StatVariant[] | undefined) ?? cfg.substats.map(s => subToVariant(s.id, s.isFlat))
                const nextVars = curVars.filter(v => { const o = variantToSub(v); return !(o.id === id && Boolean(o.isFlat) === Boolean(isFlat)) })
                const nextSubs = nextVars.map(v => variantToSub(v))
                const curFixedVars = (ext.fixedSubstatVariants as StatVariant[] | undefined) ?? (cfg.fixedSubstats ?? []).map(s => subToVariant(s.id, s.isFlat))
                const nextFixedVars = curFixedVars.filter(v => { const o = variantToSub(v); return !(o.id === id && Boolean(o.isFlat) === Boolean(isFlat)) })
                const nextFixed = nextFixedVars.map(v => variantToSub(v))
                // prune bounds for substat (both legacy- and variant-keyed)
                const b = { ...(cfg.substatRollBounds ?? {}) }
                delete b[`${id}:${Boolean(isFlat)}`]
                const pruned = Object.keys(b).length ? b : {}
                const vKey = subToVariant(id, isFlat) as number
                const bVAll = { ...((ext.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>) }
                if (vKey in bVAll) delete bVAll[vKey]
                const prunedV = Object.keys(bVAll).length ? bVAll : undefined
                const nextMin = (cfg.autoMinCount ? Math.min(4, nextSubs.length) : (cfg.minCount > nextSubs.length ? (nextSubs.length as 0|1|2|3|4) : cfg.minCount)) as 0|1|2|3|4
                onChange({ ...cfg, substats: nextSubs, fixedSubstats: nextFixed, substatVariants: nextVars as StatVariant[], fixedSubstatVariants: nextFixedVars as StatVariant[], substatRollBounds: pruned, substatRollBoundsV: (prunedV !== undefined ? prunedV as Record<number, { min?: number; max?: number; any?: boolean }> : {} as Record<number, { min?: number; max?: number; any?: boolean }>), minCount: nextMin })
              }
            const handleChange = (_: React.SyntheticEvent, v: string[]) => {
                if (!Array.isArray(v)) return
                const prevHadAny = (((ext.substatVariants?.length ?? cfg.substats?.length) ?? 0) === 0)
                const hasAny = v.includes('any')
                const others = v.filter(x => x !== 'any')

                if (others.length === 0) {
                  // No specific substats selected -> Any
                  onChange({ ...cfg, substats: [], fixedSubstats: [], substatVariants: [] as StatVariant[], fixedSubstatVariants: [] as StatVariant[], minCount: 0, substatRollBounds: {}, substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> })
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
                    // prune bounds for substats (both legacy- and variant-keyed)
                    const nextBounds = (() => {
                      const b = cfg.substatRollBounds ?? {}
                      const keepKeys = new Set(next.map(s => keyOf(s.id, s.isFlat)))
                      const out: Record<string, {min?:number;max?:number}> = {}
                      for (const [k,v] of Object.entries(b)) if (keepKeys.has(k)) out[k] = v
                      return Object.keys(out).length ? out : undefined
                    })()
                    const nextBoundsV = (() => {
                      const bV = (ext.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>
                      const keepVarKeys = new Set(next.map(s => subToVariant(s.id, s.isFlat) as number))
                      const outV: Record<number, {min?:number;max?:number;any?:boolean}> = {}
                      for (const [k,v] of Object.entries(bV)) { const nk = Number(k); if (keepVarKeys.has(nk)) outV[nk] = v as { min?: number; max?: number; any?: boolean } }
                      return Object.keys(outV).length ? outV : undefined
                    })()
                    const nextMin = (cfg.autoMinCount ? Math.min(4, next.length) : ((cfg.minCount === 0 && next.length > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                    const nextVars = next.map(s => subToVariant(s.id, s.isFlat)) as StatVariant[]
                    onChange({ ...cfg, substats: next, substatVariants: nextVars, fixedSubstats: nextFixed, minCount: nextMin, ...(nextBounds ? { substatRollBounds: nextBounds } : { substatRollBounds: {} as Record<string, { min?: number; max?: number }> }), ...(nextBoundsV ? { substatRollBoundsV: nextBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }) })
                  } else {
                    // Was on specifics, user clicked Any -> switch to Any
                    onChange({ ...cfg, substats: [], fixedSubstats: [], substatVariants: [] as StatVariant[], fixedSubstatVariants: [] as StatVariant[], minCount: 0, substatRollBounds: {}, substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> })
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
                const nextBoundsV = (() => {
                  const bV = (ext.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>
                  const keepVarKeys = new Set(next.map(s => subToVariant(s.id, s.isFlat) as number))
                  const outV: Record<number, {min?:number;max?:number;any?:boolean}> = {}
                  for (const [k,v] of Object.entries(bV)) { const nk = Number(k); if (keepVarKeys.has(nk)) outV[nk] = v as { min?: number; max?: number; any?: boolean } }
                  return Object.keys(outV).length ? outV : undefined
                })()
                const nextMin = (cfg.autoMinCount ? Math.min(4, next.length) : ((cfg.minCount === 0 && next.length > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                const nextVars = next.map(s => subToVariant(s.id, s.isFlat)) as StatVariant[]
                onChange({ ...cfg, substats: next, substatVariants: nextVars, fixedSubstats: nextFixed, minCount: nextMin, ...(nextBounds ? { substatRollBounds: nextBounds } : { substatRollBounds: {} as Record<string, { min?: number; max?: number }> }), ...(nextBoundsV ? { substatRollBoundsV: nextBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }) })
              }
              
              const BtnContent = ({ label, id, isFlat }: { label: string; id: number; isFlat?: boolean }) => {
                const b = getBounds(id, isFlat)
                const isWildcard = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const min = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                const max = (typeof b?.max === 'number' && isFinite(b.max)) ? Math.max(0, Math.min(5, Number(b?.max))) : undefined
                // no 'unset' state in UI; default is ★
                const disabled = cfg.rollMode === 'off'
                const selected = isSelected(id, isFlat)
                const title = disabled
                  ? 'Roll badge disabled.'
                  : 'Badge: click = Min (★,1–5,*). Shift+click = Max (*,0–5,*). Right‑click cycles backwards. Min is green, Max is red.'
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
                    <Tooltip title={title}>
                    <Box
                      className="roll-badge"
                      role="button"
                      onClick={(e) => { if (!isSelected(id, isFlat)) return; if (e.shiftKey) cycleMax(id, isFlat, e); else cycleMin(id, isFlat, e) }}
                      onContextMenu={(e) => { if (!isSelected(id, isFlat)) return; e.preventDefault(); if (e.shiftKey) cycleMaxBack(id, isFlat, e); else cycleMinBack(id, isFlat, e) }}
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
                    </Tooltip>
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
                <ToggleButton value={`${StatId.HP}:1`} onClick={(e)=>cycleSubstat(StatId.HP, true, e)}><BtnContent label="HP" id={StatId.HP} isFlat /></ToggleButton>
                <ToggleButton value={`${StatId.HP}:0`} onClick={(e)=>cycleSubstat(StatId.HP, false, e)}><BtnContent label="HP%" id={StatId.HP} isFlat={false} /></ToggleButton>
                <ToggleButton value={`${StatId.ATK}:1`} onClick={(e)=>cycleSubstat(StatId.ATK, true, e)}><BtnContent label="ATK" id={StatId.ATK} isFlat /></ToggleButton>
                <ToggleButton value={`${StatId.ATK}:0`} onClick={(e)=>cycleSubstat(StatId.ATK, false, e)}><BtnContent label="ATK%" id={StatId.ATK} isFlat={false} /></ToggleButton>
                <ToggleButton value={`${StatId.DEF}:1`} onClick={(e)=>cycleSubstat(StatId.DEF, true, e)}><BtnContent label="DEF" id={StatId.DEF} isFlat /></ToggleButton>
                <ToggleButton value={`${StatId.DEF}:0`} onClick={(e)=>cycleSubstat(StatId.DEF, false, e)}><BtnContent label="DEF%" id={StatId.DEF} isFlat={false} /></ToggleButton>
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
                <ToggleButton value={`${StatId.SPD}:1`} onClick={(e)=>cycleSubstat(StatId.SPD, true, e)}><BtnContent label="SPD" id={StatId.SPD} isFlat /></ToggleButton>
                <ToggleButton value={`${StatId.RES}:1`} onClick={(e)=>cycleSubstat(StatId.RES, true, e)}><BtnContent label="RES" id={StatId.RES} isFlat /></ToggleButton>
                <ToggleButton value={`${StatId.ACC}:1`} onClick={(e)=>cycleSubstat(StatId.ACC, true, e)}><BtnContent label="ACC" id={StatId.ACC} isFlat /></ToggleButton>
                <ToggleButton value={`${StatId.CR}:0`} onClick={(e)=>cycleSubstat(StatId.CR, false, e)}><BtnContent label="CR%" id={StatId.CR} isFlat={false} /></ToggleButton>
                <ToggleButton value={`${StatId.CDMG}:0`} onClick={(e)=>cycleSubstat(StatId.CDMG, false, e)}><BtnContent label="CDMG%" id={StatId.CDMG} isFlat={false} /></ToggleButton>
              </ToggleButtonGroup>
                  {/* Context menu for roll options is intentionally disabled for now */}
                </>
              )
            })()}
          </Box>
        </FormControl>

        
        {/* Slots grid 3x3 with icons */}
        <FormControl sx={(theme) => ({
          gridColumn: '1 / 3',
          borderRadius: 1,
          transition: 'background-color 220ms ease-in-out 60ms',
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title="Apply this rule only to the selected gear slots."><span>Slots</span></Tooltip></FormLabel>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
            {[
              { id: ArtifactType.Weapon, name: 'Weapon', Icon: GavelIcon },
              { id: ArtifactType.Helmet, name: 'Helmet', Icon: MilitaryTechIcon },
              { id: ArtifactType.Shield, name: 'Shield', Icon: ShieldIcon },
              { id: ArtifactType.Gauntlets, name: 'Gauntlets', Icon: BackHandIcon },
              { id: ArtifactType.Chestplate, name: 'Chestplate', Icon: CheckroomIcon },
              { id: ArtifactType.Boots, name: 'Boots', Icon: HikingIcon },
              { id: ArtifactType.Ring, name: 'Ring', Icon: DiamondIcon },
              { id: ArtifactType.Amulet, name: 'Amulet', Icon: AutoAwesomeIcon },
              { id: ArtifactType.Banner, name: 'Banner', Icon: FlagIcon },
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title="How many of your selected substats must be present. All fixed substats are always included. Target size = max(Required, Fixed), capped at 4."><span>Required substats</span></Tooltip></FormLabel>
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title="Apply this rule only to the selected gear sets."><span>Sets</span></Tooltip></FormLabel>
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
            // use parent-level metaSetsMenuOpen state to track Select menu visibility
            const selectedTokens: string[] = [
              ...(cfg.artifactMetaSets ?? []).map(tokenOf.meta),
              ...(cfg.artifactSets ?? []).map(tokenOf.set).map(String),
            ]
            const handleChange = (e: SelectChangeEvent<string[]>) => {
              const tokens = e.target.value as string[]
              const metaIds = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
              const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
              onChange({ ...cfg, artifactMetaSets: metaIds, artifactSets: setIds })
            }
            const renderValue = (tokens: string[]) => {
              const any = !tokens || tokens.length === 0
              const names: string[] = []
              if (!any) {
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
                    names.push(artifactSetName(id))
                  }
                }
              }
              const text = any ? 'Any' : names.join(', ')
              return (
                <EllipsisTooltip title={text} wrap="block">
                  <Box
                    component="span"
                    data-ellipsis-target
                    sx={{
                      display: 'block',
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {text}
                  </Box>
                </EllipsisTooltip>
              )
            }
            const fullRenderedValue = renderValue(selectedTokens)
            // Build set list per order/search
            const entries = Object.entries(artifactSetNames) as Array<[string, string]>
            const filtered = setsSearch
              ? entries.filter(([, name]) => name.toLowerCase().includes(setsSearch.toLowerCase()))
              : entries
            const sorted = setsOrder === 'az'
              ? filtered.sort((a, b) => a[1].localeCompare(b[1]))
              : filtered.sort((a, b) => Number(a[0]) - Number(b[0]))

            const ALL_META_ID = 'meta__ALL_EXPLICIT'
            const allSets = Object.keys(artifactSetNames).map(Number)
            const metasetsMenu: Metaset[] = (() => {
              const base = includeAllExplicitMeta
                ? ([{ id: ALL_META_ID, name: 'All (Explicit)', sets: allSets } as Metaset]).concat(metasets)
                : metasets
              // Hide metasets explicitly marked as hidden; treat undefined as shown
              return base.filter(m => m.id === ALL_META_ID || m.show !== false)
            })()

            return (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 520px) auto', gap: 1, alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
                <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 32, overflow: 'hidden' }}>
                  {(() => {
                    const hasSelection = Array.isArray(selectedTokens) && selectedTokens.length > 0
                    const selectEl = (
                      <Select
                        size="small"
                        multiple
                        value={selectedTokens}
                        onChange={handleChange}
                        onOpen={() => setMetaSetsMenuOpen(true)}
                        onClose={() => setMetaSetsMenuOpen(false)}
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
                    const setNames = m.sets.map(artifactSetName).filter(Boolean)
                    const joined = setNames.join(', ')
                    const isAllExplicit = m.id === ALL_META_ID
                    const usedMeta = metasetUsageCounts[m.id] || 0
                    return (
                      <MenuItem key={m.id} value={`m:${m.id}`}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                            <EllipsisTooltip title={m.name}>
                              <Typography noWrap data-ellipsis-target>{m.name}</Typography>
                            </EllipsisTooltip>
                            {m.sets.length > 0 && (
                              <Typography variant="caption" sx={{ color: 'primary.main' }}>
                                ({m.sets.length} set(s))
                              </Typography>
                            )}
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>({usedMeta} use(s) in configs)</Typography>
                          </Box>
                          {setNames.length > 0 && !isAllExplicit && (
                            <EllipsisTooltip title={joined} selector=".MuiTypography-caption">
                              <Typography
                                variant="caption"
                                sx={{ color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }}
                              >
                                {joined}
                              </Typography>
                            </EllipsisTooltip>
                          )}
                        </Box>
                      </MenuItem>
                    )
                  })}
                  <Divider sx={{ my: 0.3 }} />
                  <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Sets</ListSubheader>
                  {sorted.map(([id, name]) => {
                    const used = setUsageCounts[Number(id)] || 0
                    const metaNames = metasets
                      .filter(m => m.sets.includes(Number(id)) && m.id !== ALL_META_ID && m.show !== false)
                      .map(m => m.name)
                    const joined = metaNames.join(', ')
                    return (
                      <MenuItem key={id} value={`s:${id}`}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                            <Typography>{name}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>({used} use(s) in configs)</Typography>
                          </Box>
                          {metaNames.length > 0 && (
                            <EllipsisTooltip title={joined} selector=".MuiTypography-caption">
                              <Typography
                                variant="caption"
                                sx={{ color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }}
                              >
                                {`in: ${joined}`}
                              </Typography>
                            </EllipsisTooltip>
                          )}
                        </Box>
                      </MenuItem>
                    )
                  })}
                      </Select>
                    )
                    return (hasSelection && !metaSetsMenuOpen)
                      ? (
                        <EllipsisTooltip title={fullRenderedValue} selector=".MuiSelect-select" wrap="block">
                          {selectEl}
                        </EllipsisTooltip>
                      )
                      : selectEl
                  })()}
                </Box>
                <Button color="warning" onClick={() => setConfirmClearSets(true)}>Clear</Button>
              </Box>
            )
          })()}
        </FormControl>
        </Box>

      </Box>

        {/* Metasets dialog (separate component) */}
        <MetasetsDialog
          open={metaDlgOpen}
          onClose={() => setMetaDlgOpen(false)}
          metasets={metasets}
          onMetasetsChange={onMetasetsChange}
          onDeleteMetaset={onDeleteMetaset}
          includeAllExplicitMeta={includeAllExplicitMeta}
          onIncludeAllExplicitMetaChange={onIncludeAllExplicitMetaChange}
          setUsageCounts={setUsageCounts}
          metasetUsageCounts={metasetUsageCounts}
          setsSearch={setsSearch}
          onSetsSearchChange={setSetsSearch}
          setsOrder={setsOrder}
          onSetsOrderChange={(v) => v && setSetsOrder(v)}
          metaSetsMenuOpen={metaSetsMenuOpen}
          setMetaSetsMenuOpen={setMetaSetsMenuOpen}
        />

        <MinimaDialog open={minimaDlgOpen} onClose={() => setMinimaDlgOpen(false)} minima={minima} onMinimaChange={onMinimaChange} />

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
                mainStatVariants: [] as StatVariant[],
                startLevel: 0,
                rollMode: 'auto',
                rollBaseline: 'afterStart',
                minCount: 0,
                autoMinCount: true,
                substats: [],
                substatVariants: [] as StatVariant[],
                fixedSubstats: [],
                fixedSubstatVariants: [] as StatVariant[],
                substatRollBounds: {},
                substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }>,
                artifactTypes: [],
                artifactSets: [],
                artifactMetaSets: [],
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
