/**
 * BuilderPanel
 *
 * Main rule-builder UI. Edits a BuilderConfig, manages metasets and minima, and
 * previews generated HSF rules plus obsolete detection. Stateless except for
 * local UI state; all persisted state lives in App.
 */
import React, { useEffect, useRef, useState } from 'react'
import { rarityCodeToName, formatRank, artifactSetNames, factionCodeToName, artifactSetName, ArtifactType, StatId, StatVariant, mainToVariant, RankCode, RarityCode, Faction } from '../lib/types'
import { variantToMain } from '../lib/hsfTypes'
import MetasetsDialog from './MetasetsDialog'
import { buildHsfRules, LEVELS, type BuilderConfig, type MinimaTable } from '../lib/hsfBuilder'
import { findObsoleteRules } from '../lib/hsfObsolete'
import { type Metaset } from '../lib/metasets'



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
  // Subtle highlight of controls affected by Reset when hovering the button
  const [hoverReset, setHoverReset] = useState(false)
  // Debounced rule count for the current builder config
  const [ruleCount, setRuleCount] = useState<number | null>(null)
  const [counting, setCounting] = useState<boolean>(false)
  const countTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
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
  }, [cfg, minima])
  // setsLeftRef is used to align the Sets search row menu. No width measuring needed here.

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
            <FormLabel> <Tooltip title={"Strategy: Off (ignores badges), Strict (only fully feasible at each level), Potential (allow progress & strict once feasible), Auto (Strict when no substats have Min Rolls and Min required rolls = 0; Potential otherwise)."}><span>Roll Strategy</span></Tooltip> </FormLabel>
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
              Off: ignore roll badges; single check at the start level. Strict: only rows fully possible at each level. Potential: show early progress rows; once feasible, include the strict row and any still‑feasible progress rows. Auto: Strict when no substat has Min Rolls and “Min required rolls” is 0; Potential when either a substat has Min Rolls or “Min required rolls” &gt; 0.
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Min required rolls</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Aggregate minimum of total rolls across your selected substats. Example: 3 means at least three rolls total among them. Strict filters distributions below the aggregate at a level; Potential shows early progress only if the aggregate can still be met by +16. In Auto, setting this above 0 resolves Auto to Potential.
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
                const v = (cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []
                return v.length > 0
                  ? v.map(vv => { const m = variantToMain(vv as number); return encode(m.id, m.f) })
                  : ['any']
              })()
              const handleChange = (_: React.SyntheticEvent, v: string[]) => {
                if (!Array.isArray(v)) return
                const prevHadAny = (((cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []).length === 0)
                const hasAny = v.includes('any')
                const others = v.filter(x => x !== 'any')

                if (others.length === 0) {
                  // Any
                  onChange({ ...cfg, mainStatsV: [] })
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
                    const nextV = next.map(ms => mainToVariant(ms.id, ms.f))
                    onChange({ ...cfg, mainStatsV: nextV })
                  } else {
                    onChange({ ...cfg, mainStatsV: [] })
                  }
                  return
                }

                const next = others.map(token => {
                  const [idStr, fStr] = String(token).split(':')
                  const id = Number(idStr)
                  if (fStr !== '') return { id, f: Number(fStr) }
                  return { id }
                })
                const nextV = next.map(ms => mainToVariant(ms.id, ms.f))
                onChange({ ...cfg, mainStatsV: nextV })
              }
              return (
                <>
                  {/* Row 1: Any */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: 144, height: 36 } }}>
                    <ToggleButton value="any">Any</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={handleChange}
                    sx={{
                      gap: 0.5,
                      '& .MuiToggleButton-root': { px: 0.75, minWidth: 85, width: 85, height: 36, justifyContent: 'center' },
                      // Remove MUI's grouped negative margin to prevent 1px shifting on selection
                      '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                        marginLeft: '0 !important',
                        borderLeft: '1px solid transparent',
                      },
                      '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': {
                        marginLeft: '0 !important',
                        borderLeft: '1px solid transparent',
                      },
                    }}
                  >
                    <ToggleButton value={`${StatId.HP}:1`}>HP</ToggleButton>
                    <ToggleButton value={`${StatId.HP}:0`}>HP%</ToggleButton>
                    <ToggleButton value={`${StatId.ATK}:1`}>ATK</ToggleButton>
                    <ToggleButton value={`${StatId.ATK}:0`}>ATK%</ToggleButton>
                    <ToggleButton value={`${StatId.DEF}:1`}>DEF</ToggleButton>
                    <ToggleButton value={`${StatId.DEF}:0`}>DEF%</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={handleChange}
                    sx={{
                      gap: 0.5,
                      '& .MuiToggleButton-root': { px: 0.75, minWidth: 85, width: 85, height: 36, justifyContent: 'center' },
                      '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                        marginLeft: '0 !important',
                        borderLeft: '1px solid transparent',
                      },
                      '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': {
                        marginLeft: '0 !important',
                        borderLeft: '1px solid transparent',
                      },
                    }}
                  >
                    <ToggleButton value={`${StatId.SPD}:1`}>SPD</ToggleButton>
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Select substats to target. Click to select; click again to lock (🔒); click again to clear. Badges: click = Min (★,1–5,*), Shift+click = Max (*,0–5,*). ★ means consider all roll allocations for that substat. Fixed substats are always included. Works with Required (presence count) and Min required rolls (aggregate roll count). ‘Any’ is equivalent to selecting none."}><span>Substats</span></Tooltip></FormLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              
              const value: string[] = (() => {
                const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                if (subsV.length === 0) return ['any']
                return (subsV as number[]).map(String)
              })()
              const isSelected = (v: number) => {
                const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                return subsV.includes(v)
              }
              const isFixed = (v: number) => {
                const fixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
                return fixedV.includes(v)
              }
              const getBounds = (vKey: number) => {
                return (cfg.substatRollBoundsV)?.[vKey]
              }
              const setBounds = (vKey: number, bounds?: { min?: number; max?: number; any?: boolean }) => {
                const prevVariant = (cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
                const isEmpty = !bounds || (bounds.min === undefined && bounds.max === undefined && !('any' in bounds && bounds.any))
                let nextVariant: Record<number, { min?: number; max?: number; any?: boolean }> | undefined
                if (isEmpty) {
                  const { [vKey]: _omitV, ...restV } = prevVariant
                  nextVariant = Object.keys(restV).length ? restV : undefined
                } else {
                  nextVariant = { ...prevVariant, [vKey]: bounds }
                }
                onChange({
                  ...cfg,
                  ...(nextVariant ? { substatRollBoundsV: nextVariant } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }),
                })
              }
              // No unset: default is star (any).
              // Left click cycles Min (*,1..5,*). Shift-click cycles Max (*,0..5,*).
              // Right click cycles backwards (Min: *→5→…→1→*; Max: *→5→…→0→*).
              const cycleMin = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const curMin = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                if (isAny) {
                  // ★ -> 1 (Min)
                  setBounds(vKey, { min: 1 })
                } else if (hasMin && curMin < 5) {
                  // 1..4 -> +1; 5 handled below
                  setBounds(vKey, { min: curMin + 1 })
                } else {
                  // none or 5 -> ★
                  setBounds(vKey, { any: true })
                }
              }

              const cycleMinBack = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const curMin = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                if (isAny) {
                  // ★ -> 5 (Min)
                  setBounds(vKey, { min: 5 })
                } else if (hasMin && curMin > 1) {
                  // 2..5 -> -1; 1 handled below
                  setBounds(vKey, { min: curMin - 1 })
                } else {
                  // 1 or none -> ★
                  setBounds(vKey, { any: true })
                }
              }
              
              const cycleMax = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMax = typeof b?.max === 'number'
                const curMax = hasMax ? Math.max(0, Math.min(5, Number(b?.max))) : 0
                if (isAny) {
                  // ★ -> 0 (Max)
                  setBounds(vKey, { max: 0 })
                } else if (hasMax && curMax < 5) {
                  // 0..4 -> +1
                  setBounds(vKey, { max: curMax + 1 })
                } else if (hasMax && curMax === 5) {
                  // 5 -> ★
                  setBounds(vKey, { any: true })
                } else {
                  // none -> ★
                  setBounds(vKey, { any: true })
                }
              }
              const cycleMaxBack = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMax = typeof b?.max === 'number'
                const curMax = hasMax ? Math.max(0, Math.min(5, Number(b?.max))) : 0
                if (isAny) {
                  // ★ -> 5 (Max)
                  setBounds(vKey, { max: 5 })
                } else if (hasMax && curMax > 0) {
                  // 1..5 -> -1; 0 handled below
                  setBounds(vKey, { max: curMax - 1 })
                } else {
                  // 0 or none -> ★
                  setBounds(vKey, { any: true })
                }
              }
              
              const cycleSubstat = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                
                const selected = isSelected(vKey)
                const fixed = isFixed(vKey)
                if (!selected) {
                  const prevV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                  const nextV = [...prevV, vKey]
                  const nextLen = nextV.length
                  const nextMin = (cfg.autoMinCount ? Math.min(4, nextLen) : ((cfg.minCount === 0 && nextLen > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                  const bVAll = { ...((cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>) }
                  bVAll[vKey] = { any: true }
                  onChange({ ...cfg, substatsV: nextV, minCount: nextMin, substatRollBoundsV: bVAll })
                  return
                }
                if (selected && !fixed) {
                  const prevFixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
                  const nextFixedV2 = [...prevFixedV, vKey]
                  onChange({ ...cfg, fixedSubstatsV: nextFixedV2 })
                  return
                }
                // was fixed -> remove entirely
                const prevSubsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                const nextSubsV = prevSubsV.filter((v) => v !== vKey)
                const prevFixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
                const nextFixedV = prevFixedV.filter((v) => v !== vKey)
                // prune bounds for substat (variant-keyed)
                const bVAll = { ...((cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>) }
                const { [vKey]: _omit, ...restV } = bVAll
                const prunedV: Record<number, {min?:number; max?:number; any?:boolean}> = restV
                const nextMin = (cfg.autoMinCount ? Math.min(4, nextSubsV.length) : (cfg.minCount > nextSubsV.length ? (nextSubsV.length as 0|1|2|3|4) : cfg.minCount)) as 0|1|2|3|4
                onChange({ ...cfg, substatsV: nextSubsV, fixedSubstatsV: nextFixedV, substatRollBoundsV: prunedV, minCount: nextMin })
              }
              const handleChange = (_: React.SyntheticEvent, v: string[]) => {
                if (!Array.isArray(v)) return
                const prevSubsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                const prevHadAny = (prevSubsV.length === 0)
                const hasAny = v.includes('any')
                const others = v.filter(x => x !== 'any')

                if (others.length === 0) {
                  // No specific substats selected -> Any
                  onChange({ ...cfg, substatsV: [], fixedSubstatsV: [], minCount: 0, substatRollBoundsV: {} })
                  return
                }

                if (hasAny) {
                  if (prevHadAny) {
                    // Transition from Any -> specifics: drop Any, keep specifics
                    const next = others.map(token => Number(token))
                    const nextBoundsV = (() => {
                      const bV = (cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>
                      const keepVarKeys = new Set(next)
                      const outV: Record<number, {min?:number;max?:number;any?:boolean}> = {}
                      for (const [k,v] of Object.entries(bV)) { const nk = Number(k); if (keepVarKeys.has(nk)) outV[nk] = v as { min?: number; max?: number; any?: boolean } }
                      return Object.keys(outV).length ? outV : undefined
                    })()
                    const nextMin = (cfg.autoMinCount ? Math.min(4, next.length) : ((cfg.minCount === 0 && next.length > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                    onChange({ ...cfg, substatsV: next, fixedSubstatsV: ((((cfg as unknown) as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []).filter((v: number) => next.includes(v)), minCount: nextMin, ...(nextBoundsV ? { substatRollBoundsV: nextBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }) })
                  } else {
                    // Was on specifics, user clicked Any -> switch to Any
                    onChange({ ...cfg, substatsV: [], fixedSubstatsV: [], minCount: 0, substatRollBoundsV: {} })
                  }
                  return
                }

                // Only specifics selected
                const next = others.map(token => Number(token))
                const nextBoundsV = (() => {
                  const bV = (cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>
                  const keepVarKeys = new Set(next)
                  const outV: Record<number, {min?:number;max?:number;any?:boolean}> = {}
                  for (const [k,v] of Object.entries(bV)) { const nk = Number(k); if (keepVarKeys.has(nk)) outV[nk] = v as { min?: number; max?: number; any?: boolean } }
                  return Object.keys(outV).length ? outV : undefined
                })()
                const nextMin = (cfg.autoMinCount ? Math.min(4, next.length) : ((cfg.minCount === 0 && next.length > 0) ? 1 : cfg.minCount)) as 0|1|2|3|4
                onChange({ ...cfg, substatsV: next, fixedSubstatsV: ((((cfg as unknown) as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []).filter((v: number) => next.includes(v)), minCount: nextMin, ...(nextBoundsV ? { substatRollBoundsV: nextBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }) })
              }
              
              const BtnContent = ({ label, v }: { label: string; v: number }) => {
                const b = getBounds(v)
                const isWildcard = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const min = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                const max = (typeof b?.max === 'number' && isFinite(b.max)) ? Math.max(0, Math.min(5, Number(b?.max))) : undefined
                // no 'unset' state in UI; default is ★
                const disabled = cfg.rollMode === 'off'
                const title = disabled
                  ? 'Roll badge disabled.'
                  : 'Badge: click = Min (★,1–5,*). Shift+click = Max (*,0–5,*). Right‑click cycles backwards. Min is green, Max is red.'
                return (
                  <Box
                    className="roll-container"
                    sx={{
                      // Grid reserves space for a right-hand badge while keeping label centered
                      display: 'grid',
                      gridTemplateColumns: 'var(--sub-left-gutter, 14px) 1fr var(--sub-right-gutter, 14px)',
                      alignItems: 'center',
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      transition: 'grid-template-columns 160ms ease',
                    }}
                  >
                    {/* Left spacer keeps visual centering when badge is shown on the right */}
                    <Box sx={{ width: 14, height: 14, pointerEvents: 'none' }} />
                    <Box
                      className="roll-label"
                      component="span"
                        sx={{
                          gridColumn: '2',
                          pointerEvents: 'none',
                          textAlign: 'center',
                          pl: 0,
                          width: '100%',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          transition: 'padding-left 160ms ease',
                        }}
                    >
                      {label}
                    </Box>
                    {/* Lock indicator overlay (visual only)
                        Nudge by +3px right and +3px down to align better with label */}
                    <Box sx={{ position: 'absolute', top: -7, left: -5, opacity: isFixed(v) ? 0.9 : 0, transition: 'opacity .15s', pointerEvents: 'none', zIndex: 3 }}>
                      <LockIcon sx={{ fontSize: 14 }} />
                    </Box>
                    <Tooltip title={title}>
                      <Box
                        className="roll-badge"
                        role="button"
                        onClick={(e) => { if (!isSelected(v)) return; try { e.stopPropagation() } catch {} if (e.shiftKey) cycleMax(v, e); else cycleMin(v, e) }}
                        onContextMenu={(e) => { if (!isSelected(v)) return; e.preventDefault(); try { e.stopPropagation() } catch {} if (e.shiftKey) cycleMaxBack(v, e); else cycleMinBack(v, e) }}
                        sx={{
                          gridColumn: '3',
                          justifySelf: 'end',
                          mr: 0.5,
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          lineHeight: 1,
                          userSelect: 'none',
                          cursor: (!isSelected(v) || disabled) ? 'default' : 'pointer',
                          opacity: (!isSelected(v)) ? 0 : (disabled ? 0.5 : 1),
                          pointerEvents: isSelected(v) ? 'auto' : 'none',
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
                          zIndex: 1,
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
                    px: 0,
                    minWidth: 85,
                    width: 85,
                    height: 36,
                    justifyContent: 'center',
                    position: 'relative',
                    boxSizing: 'border-box',
                  },
                  // Default gutters used for centering label
                  '--sub-left-gutter': '14px',
                  '--sub-right-gutter': '14px',
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
                  // Labels are always left-aligned with consistent padding; no hover shift needed
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-badge': {
                    opacity: 1,
                    backgroundColor: 'transparent',
                    color: 'transparent',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover': {
                    '--sub-left-gutter': '6px',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-label': {
                    textAlign: 'left',
                    pl: 0,
                  },
                  // Selected state keeps left alignment (like hover)
                  '& .MuiToggleButton-root.Mui-selected': {
                    '--sub-left-gutter': '6px',
                  },
                  '& .MuiToggleButton-root.Mui-selected .roll-label': {
                    textAlign: 'left',
                    pl: 0,
                  },
                }}
              >
                <ToggleButton value={`${StatVariant.HP_FLAT}`} onClick={(e)=>cycleSubstat(StatVariant.HP_FLAT, e)}><BtnContent label="HP" v={StatVariant.HP_FLAT} /></ToggleButton>
                <ToggleButton value={`${StatVariant.HP}`} onClick={(e)=>cycleSubstat(StatVariant.HP, e)}><BtnContent label="HP%" v={StatVariant.HP} /></ToggleButton>
                <ToggleButton value={`${StatVariant.ATK_FLAT}`} onClick={(e)=>cycleSubstat(StatVariant.ATK_FLAT, e)}><BtnContent label="ATK" v={StatVariant.ATK_FLAT} /></ToggleButton>
                <ToggleButton value={`${StatVariant.ATK}`} onClick={(e)=>cycleSubstat(StatVariant.ATK, e)}><BtnContent label="ATK%" v={StatVariant.ATK} /></ToggleButton>
                <ToggleButton value={`${StatVariant.DEF_FLAT}`} onClick={(e)=>cycleSubstat(StatVariant.DEF_FLAT, e)}><BtnContent label="DEF" v={StatVariant.DEF_FLAT} /></ToggleButton>
                <ToggleButton value={`${StatVariant.DEF}`} onClick={(e)=>cycleSubstat(StatVariant.DEF, e)}><BtnContent label="DEF%" v={StatVariant.DEF} /></ToggleButton>
              </ToggleButtonGroup>
              {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
              <ToggleButtonGroup
                size="small"
                value={value}
                onChange={() => {}}
                sx={{
                  gap: 0.5,
                  '& .MuiToggleButton-root': {
                    px: 0,
                    minWidth: 85,
                    width: 85,
                    height: 36,
                    justifyContent: 'center',
                    position: 'relative',
                    boxSizing: 'border-box',
                  },
                  // Default gutters used for centering label
                  '--sub-left-gutter': '14px',
                  '--sub-right-gutter': '14px',
                  '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                    marginLeft: '0 !important',
                    borderLeft: '1px solid transparent',
                  },
                  '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': {
                    marginLeft: '0 !important',
                    borderLeft: '1px solid transparent',
                  },
                  // Labels are always left-aligned with consistent padding; no hover shift needed
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-badge': {
                    opacity: 1,
                    backgroundColor: 'transparent',
                    color: 'transparent',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover': {
                    '--sub-left-gutter': '6px',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-label': {
                    textAlign: 'left',
                    pl: 0,
                  },
                  // Selected state keeps left alignment (like hover)
                  '& .MuiToggleButton-root.Mui-selected': {
                    '--sub-left-gutter': '6px',
                  },
                  '& .MuiToggleButton-root.Mui-selected .roll-label': {
                    textAlign: 'left',
                    pl: 0,
                  },
                }}
              >
                <ToggleButton value={`${StatVariant.SPD}`} onClick={(e)=>cycleSubstat(StatVariant.SPD, e)}><BtnContent label="SPD" v={StatVariant.SPD} /></ToggleButton>
                <ToggleButton value={`${StatVariant.RES}`} onClick={(e)=>cycleSubstat(StatVariant.RES, e)}><BtnContent label="RES" v={StatVariant.RES} /></ToggleButton>
                <ToggleButton value={`${StatVariant.ACC}`} onClick={(e)=>cycleSubstat(StatVariant.ACC, e)}><BtnContent label="ACC" v={StatVariant.ACC} /></ToggleButton>
                <ToggleButton value={`${StatVariant.CR}`} onClick={(e)=>cycleSubstat(StatVariant.CR, e)}><BtnContent label="CR%" v={StatVariant.CR} /></ToggleButton>
                <ToggleButton value={`${StatVariant.CDMG}`} onClick={(e)=>cycleSubstat(StatVariant.CDMG, e)}><BtnContent label="CDMG%" v={StatVariant.CDMG} /></ToggleButton>
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
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'nowrap' }}>
            {/* Required substats */}
            <FormControl>
              <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"How many of your selected substats must be present (presence only). Fixed substats are always included. Target size = max(Required, Fixed), capped at 4. Independent from ‘Min required rolls’: Required controls presence; ‘Min required rolls’ controls the total roll budget across the selected substats."}><span>Required substats</span></Tooltip></FormLabel>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={cfg.autoMinCount ? 'auto' : (cfg.minCount > 0 ? String(cfg.minCount) : 'auto')}
                onChange={(_, v) => {
                  if (!v) return
                  if (v === 'auto') {
                    const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                    const nextMin = Math.min(4, subsV.length) as 0|1|2|3|4
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
            </FormControl>
            {/* Min required rolls */}
            <FormControl sx={{ ml: 1 }}>
              <FormLabel sx={{ mb: 0.5 }}>
                <Tooltip title={"Aggregate minimum of total rolls across your selected substats. Example: 3 means at least three rolls total among them. Auto = off. In Roll Strategy = Auto, setting this > 0 resolves Auto to Potential (shows early progress rows)."}>
                  <span>Min required rolls</span>
                </Tooltip>
              </FormLabel>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={(cfg.autoMinRequiredRolls || !cfg.minRequiredRolls) ? 'auto' : String(cfg.minRequiredRolls)}
                onChange={(_, v) => {
                  if (!v) return
                  if (v === 'auto') { onChange({ ...cfg, autoMinRequiredRolls: true, minRequiredRolls: 0 }) ; return }
                  const next = Math.max(1, Math.min(5, Number(v))) as 1|2|3|4|5
                  onChange({ ...cfg, autoMinRequiredRolls: false, minRequiredRolls: next })
                }}
              >
                <ToggleButton value="auto">Auto</ToggleButton>
                {([1,2,3,4,5] as const).map((n) => (
                  <ToggleButton key={n} value={String(n)}>{n}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </FormControl>
            <Box sx={{ flex: 1 }} />
            <Button size="small" variant="outlined" onClick={() => setMinimaDlgOpen(true)} sx={{ whiteSpace: 'nowrap', minWidth: 160, ml: 'auto' }}>Substat Values…</Button>
          </Box>
        </FormControl>
        {/* Reserved warning area to avoid layout shifts (shown between Required and Sets) */}
        {(() => {
          const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
          const fixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
          const chosenCount = subsV.length
          const fixedCount = fixedV.length
          const warnMin = chosenCount < cfg.minCount
          const warnFixed = fixedCount > 4
          let msg: string | null = null
          if (warnMin) msg = `Required (${cfg.minCount}) > chosen (${chosenCount})`
          else if (warnFixed) msg = `Fixed substats (${fixedCount}) exceed 4 — extra will be ignored`
          return (
            <Box sx={{ height: 32, position: 'relative' }}>
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 0.5, visibility: msg ? 'visible' : 'hidden' }}>
                <Typography variant="caption" color="warning.main">Warning:</Typography>
                <Typography variant="caption" color="warning.main" sx={{ whiteSpace: 'nowrap' }}>{msg ?? ''}</Typography>
              </Box>
            </Box>
          )
        })()}

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
                mainStatsV: [],
                
                startLevel: 0,
                rollMode: 'auto',
                rollBaseline: 'afterStart',
                minCount: 0,
                autoMinCount: true,
                minRequiredRolls: 0,
                autoMinRequiredRolls: true,
                substatsV: [],
                
                fixedSubstatsV: [],
                
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
