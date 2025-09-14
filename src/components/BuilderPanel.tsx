/**
 * BuilderPanel
 *
 * Main rule-builder UI. Edits a BuilderConfig, manages metasets and minima, and
 * previews generated HSF rules plus obsolete detection. Stateless except for
 * local UI state; all persisted state lives in App.
 */
import React, { useEffect, useRef, useState } from 'react'
import { rarityCodeToName, formatRank, factionCodeToName, artifactSetName, StatVariant, RankCode, RarityCode, Faction, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, labelOfVariant, filterAndSortSetEntries } from '../lib/types'
import { RARITY_AUTO_LABEL } from '../lib/constants'
import SetMenuSection from './SetMenuSection'
import MetasetsDialog from './MetasetsDialog'
import { useMetasetsDialog } from '../hooks/useMetasetsDialog'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { buildHsfRules, LEVELS, type BuilderConfig, type MinimaTable } from '../lib/hsfBuilder'
import { findObsoleteRules } from '../lib/hsfObsolete'
import { type Metaset } from '../lib/metasets'



//

import { Box, Button, Divider, Stack, Typography, TextField, Chip, FormControl, FormLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, ListSubheader, Popover, InputAdornment } from '@mui/material'
import SetsOrderControls from './SetsOrderControls'
import MinimaDialog from './MinimaDialog'
import { useMinimaDialog } from '../hooks/useMinimaDialog'
import type { SelectChangeEvent } from '@mui/material/Select'
import { IconButton, Tooltip, ToggleButton, ToggleButtonGroup } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { artifactTypeIconList } from './artifactTypeIcons'
import EllipsisTooltip from './EllipsisTooltip'
import LockIcon from '@mui/icons-material/Lock'
import ClearIcon from '@mui/icons-material/Clear'
import { ROLL_BADGE_SIZE_PX, ROLL_BADGE_HOVER_GUTTER_PX, ROLL_BADGE_SCALE, UI_BG_TRANSITION, SETS_ORDER_KEY, LIST_SUBHEADER_SX, MENU_SELECTED_BG_ALPHA, MENU_SELECTED_BG_HOVER_ALPHA, MENU_MAX_HEIGHT_METASETS_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_SCROLL_GUTTER_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, SETS_MENU_WIDTH_PX, UI_SUBSTAT_WARNING_ROW_HEIGHT_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX } from '../lib/constants'
import { alpha } from '@mui/material/styles'
export default function BuilderPanel({ cfg, onChange, onAddToCustom, editingIndex, onUpdateSelected, metasets, onMetasetsChange, onDeleteMetaset, minima, onMinimaChange, setUsageCounts, metasetUsageCounts, substatColors, hasAnyConfigs, useStatButtonBorders }: {
  cfg: BuilderConfig,
  onChange: (c: BuilderConfig) => void
  onAddToCustom: () => void
  editingIndex: number | null
  onUpdateSelected: () => void
  metasets: Metaset[]
  onMetasetsChange: (next: Metaset[]) => void
  onDeleteMetaset: (id: string, opts?: { replaceWithSets?: boolean; replaceWithMetaId?: string }) => void
  minima: MinimaTable
  onMinimaChange: (m: MinimaTable) => void
  setUsageCounts: Record<number, number>
  metasetUsageCounts: Record<string, number>
  substatColors: Record<number, { fg: string; bg: string }>
  hasAnyConfigs: boolean
  useStatButtonBorders: boolean
}) {
  // Roll badge sizing and hover gutter come from centralized constants.
  // Local UI sizing constants for toggle buttons (shared within this component only)
  const TOGGLE_BUTTON_ANY_MIN_WIDTH_PX = 144
  const TOGGLE_BUTTON_MIN_WIDTH_PX = 85
  const TOGGLE_BUTTON_HEIGHT_PX = 36
  const update = <K extends keyof BuilderConfig>(k: K, v: BuilderConfig[K]) => onChange({ ...cfg, [k]: v })
  // Border color reflects the table's per-stat color theme.
  // Applied only when there's at least one config, to reduce visual noise.
  const buttonBorderSx = (variant: number) => {
    if (!hasAnyConfigs || !useStatButtonBorders) return {}
    const fg = (substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant] ?? '#90CAF9') as string
    return { borderColor: fg } as const
  }
  // Help popover (legacy copy still present); retained to avoid unused code churn.
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null)
  const [helpPos, setHelpPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  useEffect(() => {
    if (!helpAnchor) return
    const updateHelpPos = () => {
      try {
        setHelpPos({ top: Math.round(window.innerHeight / 2), left: Math.round(window.innerWidth / 2) })
      } catch {}
    }
    updateHelpPos()
    window.addEventListener('resize', updateHelpPos)
    return () => window.removeEventListener('resize', updateHelpPos)
  }, [helpAnchor])
  // Sets selector ordering/display mode. 'icons' switches the regular Sets list
  // to an icon-only grid; metasets continue to render as a text list.
  const [setsOrder, setSetsOrder] = useState<'game' | 'az' | 'icons'>(() => {
    try {
      const raw = localStorage.getItem(SETS_ORDER_KEY)
      if (raw === 'game' || raw === 'az' || raw === 'icons') return raw
    } catch {}
    return 'icons'
  })
  useEffect(() => {
    try { localStorage.setItem(SETS_ORDER_KEY, setsOrder) } catch {}
  }, [setsOrder])
  const [setsSearch, setSetsSearch] = useState('')
  const { open: metaDlgOpen, openDialog: openMetaDlg, closeDialog: closeMetaDlg } = useMetasetsDialog()
  const [metaSetsMenuOpen, setMetaSetsMenuOpen] = useState(false)
  // Fixed screen anchor for the Sets menu so header position doesn't move when height changes
  const [setsMenuAnchorPos, setSetsMenuAnchorPos] = useState<{ top: number; left: number } | null>(null)
  // While the Sets select menu is open, track which metaset the user is hovering
  // to temporarily highlight member gear sets in the Sets list/grid.
  const [hoveredSetMetaId, setHoveredSetMetaId] = useState<string | null>(null)
  const { open: confirmClearSets, openDialog: openConfirmClearSets, closeDialog: closeConfirmClearSets } = useConfirmDialog()
  const { open: minimaDlgOpen, openDialog: openMinimaDlg, closeDialog: closeMinimaDlg } = useMinimaDialog()
  
  const [confirmResetBuilder, setConfirmResetBuilder] = useState(false)

  
  const setsLeftRef = useRef<HTMLDivElement | null>(null)
  // Paper element for the Sets select menu; used to measure actual height
  // after mount so we can refine the anchor position precisely.
  const setsMenuPaperRef = useRef<HTMLDivElement | null>(null)
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
      } catch (_e) {
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

  // Local draft for config name to keep typing snappy; sync upstream with debounce
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
        <Box sx={(theme) => ({
          gridColumn: '1 / -1',
          borderRadius: 1,
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <TextField
            label="Config Name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => { if (nameDraft !== (cfg.name ?? '')) update('name', nameDraft) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
            InputProps={{
              endAdornment: nameDraft ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear config name"
                    onClick={() => { setNameDraft(''); if ((cfg.name ?? '') !== '') update('name', '') }}
                    edge="end"
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
            fullWidth
            inputProps={{ 'data-tour-id': 'builder.name' }}
          />
        </Box>

        <FormControl sx={(theme) => ({
          gridColumn: '1 / -1',
          borderRadius: 1,
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Choose what this config does. Keep: matching gear is kept. Sell: matching gear is sold."}><span>Action</span></Tooltip></FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.keep ? 'keep' : 'sell'}
              onChange={(_, v) => v && update('keep', v === 'keep')}
              sx={{ height: 40 }}
              data-tour-id="builder.action"
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
                <Tooltip title={isEnabled ? 'Enabled in exported file' : 'Disabled in exported file'}>
                  <Button
                    size="small"
                    variant={isEnabled ? 'contained' : 'outlined'}
                    color={isEnabled ? 'success' : 'warning'}
                    sx={{ minWidth: 160, ml: 1 }}
                    startIcon={isEnabled ? <VisibilityIcon /> : <VisibilityOffIcon />}
                    onClick={() => update('enabled', !isEnabled)}
                    data-tour-id="builder.enabled"
                  >
                    {isEnabled ? 'Enabled in Sellfile' : 'Disabled in Sellfile'}
                  </Button>
                </Tooltip>
              )
            })()}
            <Box sx={{ ml: 'auto' }}>
              <Tooltip title="Open quick builder help">
                <IconButton
                  size="medium"
                  color="primary"
                  onClick={(e) => setHelpAnchor(e.currentTarget as HTMLElement)}
                  aria-label="Open builder help"
                >
                  <HelpOutlineIcon fontSize="medium" />
                </IconButton>
              </Tooltip>
            </Box>
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
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Which star ranks to match. ‘Any’ matches all."}><span>Rank</span></Tooltip></FormLabel>
          <Select
            size="small"
            value={String(cfg.rankCode)}
            onChange={(e: SelectChangeEvent<string>) => update('rankCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
            data-tour-id="builder.rank"
          >
            <MenuItem value={String(0)}>{formatRank(0) || 'Any'}</MenuItem>
            <ListSubheader sx={LIST_SUBHEADER_SX}>Exact</ListSubheader>
            {[RankCode.One,RankCode.Two,RankCode.Three,RankCode.Four,RankCode.Five,RankCode.Six].map((code) => (
              <MenuItem key={code} value={String(code)}>{formatRank(code)}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>≥ Ranges</ListSubheader>
            {[RankCode.GTE_One,RankCode.GTE_Two,RankCode.GTE_Three,RankCode.GTE_Four,RankCode.GTE_Five].map((code) => (
              <MenuItem key={code} value={String(code)}>{formatRank(code)}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>≤ Ranges</ListSubheader>
            {[RankCode.LTE_Two,RankCode.LTE_Three,RankCode.LTE_Four,RankCode.LTE_Five,RankCode.LTE_Six].map((code) => (
              <MenuItem key={code} value={String(code)}>{formatRank(code)}</MenuItem>
            ))}
          </Select>
          
        </FormControl>

        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Auto picks the lowest rarity that still makes your picks possible in the chosen level range.\n• No roll mins: stays broad (works for all)\n• +0 with 1/2/3/4 subs: ensures start with that many (1→≥Uncommon, 2→≥Rare, 3→≥Epic, 4→≥Legendary)\n• Min total rolls: picks rarity that can reach it by +16 (5→Mythical)\nRanges include higher or lower rarities as labeled."}><span>Rarity</span></Tooltip></FormLabel>
          <Select
            size="small"
            value={cfg.rarityMode === 'auto' ? 'auto' : String(cfg.rarityCode)}
            onChange={(e: SelectChangeEvent<string>) => {
              const v = e.target.value
              if (v === 'auto') {
                onChange({ ...cfg, rarityMode: 'auto' })
              } else {
                onChange({ ...cfg, rarityMode: 'code', rarityCode: Number(v) })
              }
            }}
            MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
            data-tour-id="builder.rarity"
          >
            <MenuItem value={'auto'}>{RARITY_AUTO_LABEL}</MenuItem>
            <MenuItem value={String(0)}>{rarityCodeToName(0) || 'Any'}</MenuItem>
            <ListSubheader sx={LIST_SUBHEADER_SX}>Exact</ListSubheader>
            {[RarityCode.Common,RarityCode.Uncommon,RarityCode.Rare,RarityCode.Epic,RarityCode.Legendary,RarityCode.Mythical].map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code)}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>≥ Ranges</ListSubheader>
            {[RarityCode.GTE_Common,RarityCode.GTE_Uncommon,RarityCode.GTE_Rare,RarityCode.GTE_Epic,RarityCode.GTE_Legendary].map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code)}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>≤ Ranges</ListSubheader>
            {[RarityCode.LTE_Uncommon,RarityCode.LTE_Rare,RarityCode.LTE_Epic,RarityCode.LTE_Legendary,RarityCode.LTE_Mythical].map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code)}</MenuItem>
            ))}
          </Select>
          
        </FormControl>

        {/* Faction selection (accessories only) */}
        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Accessories only (ring, amulet, banner). Other gear ignores this."}><span>Faction</span></Tooltip></FormLabel>
          <Select
            size="small"
            value={String(cfg.factionCode ?? 0)}
            onChange={(e: SelectChangeEvent<string>) => update('factionCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
            data-tour-id="builder.faction"
          >
            <MenuItem value={String(0)}>Any</MenuItem>
            <ListSubheader sx={LIST_SUBHEADER_SX}>Telerian League</ListSubheader>
            {[Faction.BannerLords,Faction.HighElves,Faction.SacredOrder,Faction.Barbarians].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionCodeToName(code)}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>Gaellen Pact</ListSubheader>
            {[Faction.OgrynTribes,Faction.Lizardmen,Faction.Skinwalkers,Faction.Orcs].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionCodeToName(code)}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>The Corrupted</ListSubheader>
            {[Faction.Demonspawn,Faction.UndeadHordes,Faction.DarkElves,Faction.KnightRevenant].map((code) => (
              <MenuItem key={code} value={String(code)}>{factionCodeToName(code)}</MenuItem>
            ))}
            <ListSubheader sx={LIST_SUBHEADER_SX}>Nyresan Union</ListSubheader>
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
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
        <FormControl>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={'Earliest level to check (+0, +4, …).'}><span>Min Level</span></Tooltip></FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={String((cfg as BuilderConfig).minLevel ?? 0)}
              onChange={(_, v) => {
                if (!v) return
                const num = Number(v)
                if ([0,4,8,12,16].includes(num)) {
                  const currentMax = ((cfg as BuilderConfig).maxLevel ?? 16) as 0|4|8|12|16
                  const nextMin = num as 0|4|8|12|16
                  const nextMax = (nextMin > currentMax ? nextMin : currentMax) as 0|4|8|12|16
                  onChange({ ...cfg, minLevel: nextMin, maxLevel: nextMax })
                }
              }}
              sx={{ height: 40 }}
            >
              {LEVELS.map((l) => (
                <ToggleButton key={l} value={String(l)}>+{l}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </FormControl>

        <FormControl>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={'Latest level to check (+0, +4, …).'}><span>Max Level</span></Tooltip></FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={String((cfg as BuilderConfig).maxLevel ?? 16)}
              onChange={(_, v) => {
                if (!v) return
                const num = Number(v)
                if ([0,4,8,12,16].includes(num)) {
                  const currentMin = ((cfg as BuilderConfig).minLevel ?? 0) as 0|4|8|12|16
                  const nextMax = num as 0|4|8|12|16
                  const nextMin = (nextMax < currentMin ? nextMax : currentMin) as 0|4|8|12|16
                  onChange({ ...cfg, minLevel: nextMin, maxLevel: nextMax })
                }
              }}
              sx={{ height: 40 }}
            >
              {LEVELS.map((l) => (
                <ToggleButton key={l} value={String(l)}>+{l}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </FormControl>
        {/* Substat Values… (bottom-right aligned with Max Level toggles) */}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'flex-end', alignSelf: 'flex-end' }}>
          <Button size="small" variant="outlined" onClick={openMinimaDlg} sx={{ whiteSpace: 'nowrap', minWidth: 160 }}>Substat Values…</Button>
        </Box>

        {/* Roll Strategy removed — level window controls replace it. */}
        
        </Box>
        {/* Help popover */}
        <Popover
          open={Boolean(helpAnchor)}
          anchorReference="anchorPosition"
          anchorPosition={helpPos}
          onClose={() => setHelpAnchor(null)}
          transformOrigin={{ vertical: 'center', horizontal: 'center' }}
          PaperProps={{ sx: { width: 'min(96vw, 980px)' } }}
        >
          <Box sx={{ p: 2 }}>
            {/* Simplified, user-focused help copy: emphasize keep/sell and common setups */}
            <Typography variant="subtitle2" sx={{ mb: 1 }}>How these settings work</Typography>
            <Divider sx={{ mb: 1, opacity: 0.5 }} />
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Keep vs Sell</strong><br />
              This config matches items. If Keep, matching items are kept; if Sell, matching items are sold. Rank, Rarity, Faction, Slots, and Sets filter items first.
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Levels & Milestone Thresholds</Typography>
            <Box component="ul" sx={{ pl: 2, mb: 1, mt: 0 }}>
              <li><Typography variant="body2">Use Min/Max Level to pick the milestone window (+0, +4, +8, +12, +16).</Typography></li>
              <li><Typography variant="body2">Before +16, if your rarity cannot yet have the requested number of substats, rules use the number that can exist at that level. At +16, rules use your requested count.</Typography></li>
              <li><Typography variant="body2">Rarity “Any” treats substat presence like ≥ Legendary (no additions) while roll schedules still follow the rarity/range.</Typography></li>
              <li><Typography variant="body2">Milestone Thresholds (when Min Rolls are set): Early shows thresholds based on rolls gained so far; Late requires only what must be present now so the +16 target remains achievable. With only wildcards (★) plus a Min Required sum, Early shows minimal splits at each milestone (stable list), and Late applies those minimal splits at +16 while showing presence early.</Typography></li>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Substats</Typography>
            <Box component="ul" sx={{ pl: 2, mb: 1, mt: 0 }}>
              <li><Typography variant="body2">Click to select; click again to lock (🔒) so the item must have it.</Typography></li>
              <li><Typography variant="body2">Use the round roll indicator on each selected stat: click for Min (★, 0–5), Shift+click for Roll cap (0–4), right‑click goes backward.</Typography></li>
              <li><Typography variant="body2">Min means at least that many rolls by the target level. Roll cap limits rolls on that stat (0 forbids rolls).</Typography></li>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Required substats</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              How many of your picked substats the item must have. Locked substats always count. “Auto” sets it to min(4, number selected) and keeps it in sync as you add or remove substats.
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Min required rolls</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Minimum total rolls across your picked substats (sum). 0 means no aggregate minimum. Example: 3 means your chosen substats have at least 3 rolls in total by the target level. With only wildcards (★), Early keeps early rows concise (minimal splits per milestone); Late shows presence early and enforces the minimal splits at +16.
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>Common setups</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 0.5 }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>A) Two must-have + one optional</Typography>
                <Box component="ul" sx={{ pl: 2, m: 0, '& li': { m: 0, p: 0 }, '& li + li': { mt: '2px' } }}>
                  <li><Typography variant="body2">Select: SPD, ACC, HP%, DEF%, RES</Typography></li>
                  <li><Typography variant="body2">Lock: SPD and ACC (click twice)</Typography></li>
                  <li><Typography variant="body2">Required substats: 3</Typography></li>
                  <li><Typography variant="body2">Result: Must have SPD and ACC, plus any one of HP%/DEF%/RES.</Typography></li>
                </Box>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>B) Exactly three core substats</Typography>
                <Box component="ul" sx={{ pl: 2, m: 0, '& li': { m: 0, p: 0 }, '& li + li': { mt: '2px' } }}>
                  <li><Typography variant="body2">Select: SPD, CR%, CDMG%</Typography></li>
                  <li><Typography variant="body2">Required substats: 3</Typography></li>
                  <li><Typography variant="body2">Result: Must have all three. (Optionally set roll indicators.)</Typography></li>
                </Box>
              </Box>
            </Box>
          </Box>
        </Popover>
        {/* Row 3: Mainstat (left), Substats (right) */}
        <FormControl sx={(theme) => ({
          gridColumn: '1 / 3',
          borderRadius: 1,
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Pick main stat(s). Leave empty for Any."}><span>Mainstat</span></Tooltip></FormLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              const value: string[] = (() => {
                const v = (cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []
                return v.length > 0 ? v.map(String) : ['any']
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
                    const nextV = others.map(token => Number(token)).filter((n) => Number.isFinite(n))
                    onChange({ ...cfg, mainStatsV: nextV as number[] })
                  } else {
                    onChange({ ...cfg, mainStatsV: [] })
                  }
                  return
                }

                const nextV = others.map(token => Number(token)).filter((n) => Number.isFinite(n))
                onChange({ ...cfg, mainStatsV: nextV as number[] })
              }
              return (
                <>
                  {/* Row 1: Any */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: TOGGLE_BUTTON_ANY_MIN_WIDTH_PX, height: TOGGLE_BUTTON_HEIGHT_PX } }} data-tour-id="builder.mainstat">
                    <ToggleButton value="any">Any</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={handleChange}
                    sx={{
                      gap: 0.5,
                      '& .MuiToggleButton-root': { px: 0.75, minWidth: TOGGLE_BUTTON_MIN_WIDTH_PX, width: TOGGLE_BUTTON_MIN_WIDTH_PX, height: TOGGLE_BUTTON_HEIGHT_PX, justifyContent: 'center' },
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
                    <ToggleButton value={`${StatVariant.HP_FLAT}`} sx={buttonBorderSx(StatVariant.HP_FLAT)}>{labelOfVariant(StatVariant.HP_FLAT)}</ToggleButton>
                    <ToggleButton value={`${StatVariant.HP}`} sx={buttonBorderSx(StatVariant.HP)}>{labelOfVariant(StatVariant.HP)}</ToggleButton>
                    <ToggleButton value={`${StatVariant.ATK_FLAT}`} sx={buttonBorderSx(StatVariant.ATK_FLAT)}>{labelOfVariant(StatVariant.ATK_FLAT)}</ToggleButton>
                    <ToggleButton value={`${StatVariant.ATK}`} sx={buttonBorderSx(StatVariant.ATK)}>{labelOfVariant(StatVariant.ATK)}</ToggleButton>
                    <ToggleButton value={`${StatVariant.DEF_FLAT}`} sx={buttonBorderSx(StatVariant.DEF_FLAT)}>{labelOfVariant(StatVariant.DEF_FLAT)}</ToggleButton>
                    <ToggleButton value={`${StatVariant.DEF}`} sx={buttonBorderSx(StatVariant.DEF)}>{labelOfVariant(StatVariant.DEF)}</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={handleChange}
                    sx={{
                      gap: 0.5,
                      '& .MuiToggleButton-root': { px: 0.75, minWidth: TOGGLE_BUTTON_MIN_WIDTH_PX, width: TOGGLE_BUTTON_MIN_WIDTH_PX, height: TOGGLE_BUTTON_HEIGHT_PX, justifyContent: 'center' },
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
                    <ToggleButton value={`${StatVariant.SPD}`} sx={buttonBorderSx(StatVariant.SPD)} data-tour-id="builder.mainstat.spd">{labelOfVariant(StatVariant.SPD)}</ToggleButton>
                    <ToggleButton value={`${StatVariant.RES}`} sx={buttonBorderSx(StatVariant.RES)}>{labelOfVariant(StatVariant.RES)}</ToggleButton>
                    <ToggleButton value={`${StatVariant.ACC}`} sx={buttonBorderSx(StatVariant.ACC)}>{labelOfVariant(StatVariant.ACC)}</ToggleButton>
                    <ToggleButton value={`${StatVariant.CR}`} sx={buttonBorderSx(StatVariant.CR)}>{labelOfVariant(StatVariant.CR)}</ToggleButton>
                    <ToggleButton value={`${StatVariant.CDMG}`} sx={buttonBorderSx(StatVariant.CDMG)}>{labelOfVariant(StatVariant.CDMG)}</ToggleButton>
                  </ToggleButtonGroup>
                </>
              )
            })()}
          </Box>
        </FormControl>

        <FormControl sx={(theme) => ({
          gridColumn: '3 / 5',
          borderRadius: 1,
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })} data-tour-id="builder.substats">
            <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Pick substats. Click to select; click again to lock (🔒) so it must be on the item. Use the round roll indicator to set Min (green) or Roll cap (red) rolls."}><span>Substats</span></Tooltip></FormLabel>
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
                // If Milestone Thresholds become inactive (no per‑stat mins and no global min),
                // reset mode to Early so re‑enabling starts at Early.
                const hadPerStatMin = Object.values(prevVariant).some(v => typeof v?.min === 'number' && (v.min ?? 0) > 0)
                const willPerStatMin = Object.values(nextVariant ?? {}).some(v => typeof v?.min === 'number' && (v.min ?? 0) > 0)
                const hasGlobalMin = (cfg.autoMinRequiredRolls === false) && typeof cfg.minRequiredRolls === 'number' && (cfg.minRequiredRolls ?? 0) > 0
                const prevActive = hadPerStatMin || hasGlobalMin
                const nextActive = willPerStatMin || hasGlobalMin
                onChange({
                  ...cfg,
                  ...(nextVariant ? { substatRollBoundsV: nextVariant } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }),
                  ...((prevActive && !nextActive) ? { earlyKeepMode: 'early' as const } : {}),
                })
              }
              // No unset: default is star (any).
              // Left click cycles Min (*,0..5,*). Shift-click cycles Max (*,0..4,*).
              // Right click cycles backwards (Min: *→5→…→0→*; Max: *→4→…→0→*).
              const cycleMin = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const curMin = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                if (isAny) {
                  // ★ -> 0 (Min)
                  setBounds(vKey, { min: 0 })
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
                } else if (hasMin && curMin > 0) {
                  // 1..5 -> -1; 0 handled below
                  setBounds(vKey, { min: curMin - 1 })
                } else {
                  // 0 or none -> ★
                  setBounds(vKey, { any: true })
                }
              }
              
              const cycleMax = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (cfg.rollMode === 'off') return
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMax = typeof b?.max === 'number'
                const curMax = hasMax ? Math.max(0, Math.min(4, Number(b?.max))) : 0
                if (isAny) {
                  // ★ -> 0 (Max)
                  setBounds(vKey, { max: 0 })
                } else if (hasMax && curMax < 4) {
                  // 0..3 -> +1
                  setBounds(vKey, { max: curMax + 1 })
                } else if (hasMax && curMax === 4) {
                  // 4 -> ★
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
                const curMax = hasMax ? Math.max(0, Math.min(4, Number(b?.max))) : 0
                if (isAny) {
                  // ★ -> 4 (Max)
                  setBounds(vKey, { max: 4 })
                } else if (hasMax && curMax > 0) {
                  // 1..4 -> -1; 0 handled below
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
                // Check if this removal deactivates Milestone Thresholds; if so, reset to Early.
                const willPerStatMin = Object.values(prunedV).some(v => typeof v?.min === 'number' && (v.min ?? 0) > 0)
                const hasGlobalMin = (cfg.autoMinRequiredRolls === false) && typeof cfg.minRequiredRolls === 'number' && (cfg.minRequiredRolls ?? 0) > 0
                const nextActive = willPerStatMin || hasGlobalMin
                const hadPerStatMin = Object.values(bVAll).some(v => typeof v?.min === 'number' && (v.min ?? 0) > 0)
                const prevActive = hadPerStatMin || hasGlobalMin
                onChange({ ...cfg, substatsV: nextSubsV, fixedSubstatsV: nextFixedV, substatRollBoundsV: prunedV, minCount: nextMin, ...((prevActive && !nextActive) ? { earlyKeepMode: 'early' as const } : {}) })
              }
              const handleChange = (_: React.SyntheticEvent, v: string[]) => {
                if (!Array.isArray(v)) return
                const prevSubsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                const prevHadAny = (prevSubsV.length === 0)
                const hasAny = v.includes('any')
                const others = v.filter(x => x !== 'any')

                if (others.length === 0) {
                  // No specific substats selected -> Any
                  // Clearing all bounds may deactivate Milestone Thresholds; reset to Early if so.
                  const hasGlobalMin0 = (cfg.autoMinRequiredRolls === false) && typeof cfg.minRequiredRolls === 'number' && (cfg.minRequiredRolls ?? 0) > 0
                  const prevB0 = (cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>
                  const hadPerStatMin0 = Object.values(prevB0).some(v => typeof v?.min === 'number' && (v.min ?? 0) > 0)
                  const prevActive0 = hadPerStatMin0 || hasGlobalMin0
                  const nextActive0 = hasGlobalMin0 // bounds cleared, rely only on global
                  onChange({ ...cfg, substatsV: [], fixedSubstatsV: [], minCount: 0, substatRollBoundsV: {}, ...((prevActive0 && !nextActive0) ? { earlyKeepMode: 'early' as const } : {}) })
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
                    // If pruning clears all per‑stat mins and there's no global min, reset to Early.
                    const prevB1 = (cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>
                    const hadPerStatMin1 = Object.values(prevB1).some(v => typeof v?.min === 'number' && (v.min ?? 0) > 0)
                    const willPerStatMin1 = Object.values((nextBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>).some(v => typeof v?.min === 'number' && (v.min ?? 0) > 0)
                    const hasGlobalMin1 = (cfg.autoMinRequiredRolls === false) && typeof cfg.minRequiredRolls === 'number' && (cfg.minRequiredRolls ?? 0) > 0
                    const prevActive1 = hadPerStatMin1 || hasGlobalMin1
                    const nextActive1 = willPerStatMin1 || hasGlobalMin1
                    onChange({ ...cfg, substatsV: next, fixedSubstatsV: ((((cfg as unknown) as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []).filter((v: number) => next.includes(v)), minCount: nextMin, ...(nextBoundsV ? { substatRollBoundsV: nextBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }), ...((prevActive1 && !nextActive1) ? { earlyKeepMode: 'early' as const } : {}) })
                  } else {
                    // Was on specifics, user clicked Any -> switch to Any
                    const hasGlobalMin2 = (cfg.autoMinRequiredRolls === false) && typeof cfg.minRequiredRolls === 'number' && (cfg.minRequiredRolls ?? 0) > 0
                    const prevB2 = (cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>
                    const hadPerStatMin2 = Object.values(prevB2).some(v => typeof v?.min === 'number' && (v.min ?? 0) > 0)
                    const prevActive2 = hadPerStatMin2 || hasGlobalMin2
                    const nextActive2 = hasGlobalMin2
                    onChange({ ...cfg, substatsV: [], fixedSubstatsV: [], minCount: 0, substatRollBoundsV: {}, ...((prevActive2 && !nextActive2) ? { earlyKeepMode: 'early' as const } : {}) })
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
                // If pruning clears all per‑stat mins and there's no global min, reset to Early.
                const prevB3 = (cfg.substatRollBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>
                const hadPerStatMin3 = Object.values(prevB3).some(v => typeof v?.min === 'number' && (v.min ?? 0) > 0)
                const willPerStatMin3 = Object.values((nextBoundsV ?? {}) as Record<number, {min?:number; max?:number; any?:boolean}>).some(v => typeof v?.min === 'number' && (v.min ?? 0) > 0)
                const hasGlobalMin3 = (cfg.autoMinRequiredRolls === false) && typeof cfg.minRequiredRolls === 'number' && (cfg.minRequiredRolls ?? 0) > 0
                const prevActive3 = hadPerStatMin3 || hasGlobalMin3
                const nextActive3 = willPerStatMin3 || hasGlobalMin3
                onChange({ ...cfg, substatsV: next, fixedSubstatsV: ((((cfg as unknown) as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []).filter((v: number) => next.includes(v)), minCount: nextMin, ...(nextBoundsV ? { substatRollBoundsV: nextBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> } : { substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }> }), ...((prevActive3 && !nextActive3) ? { earlyKeepMode: 'early' as const } : {}) })
              }
              
              const BtnContent = ({ label, v }: { label: string; v: number }) => {
                const b = getBounds(v)
                const hasMin = typeof b?.min === 'number'
                const min = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                const hasMax = (typeof b?.max === 'number' && isFinite(b.max))
                const max = hasMax ? Math.max(0, Math.min(4, Number(b?.max))) : undefined
                // Visual default: selected with no bounds shows ★ (wildcard)
                const isWildcard = Boolean(b?.any) || (!hasMin && !hasMax)
                // no 'unset' state in UI; default is ★
                const disabled = cfg.rollMode === 'off'
                const title = disabled
                  ? 'Roll indicator disabled.'
                  : 'Roll indicator: click to set Min (★ → 0 → 1 → 2 → 3 → 4 → 5 → ★). Shift+click to set Roll cap (★ → 0 → 1 → 2 → 3 → 4 → ★). Right‑click goes backward. Min is green; Roll cap is red.'
                return (
                  <Box
                    className="roll-container"
                    sx={{
                      // Grid reserves space for a right-hand badge while keeping label centered
                      display: 'grid',
                      gridTemplateColumns: `var(--sub-left-gutter, ${ROLL_BADGE_SIZE_PX}px) 1fr var(--sub-right-gutter, ${ROLL_BADGE_SIZE_PX}px)`,
                      alignItems: 'center',
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      transition: 'grid-template-columns 160ms ease',
                    }}
                  >
                    {/* Left spacer keeps visual centering when badge is shown on the right */}
                    <Box sx={{ width: ROLL_BADGE_SIZE_PX, height: ROLL_BADGE_SIZE_PX, pointerEvents: 'none' }} />
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
                          //textOverflow: 'ellipsis',
                          transition: 'padding-left 160ms ease',
                        }}
                    >
                      {label}
                    </Box>
                    {/* Lock indicator overlay (visual only)
                        Slight offset for alignment clarity relative to the label */}
                    <Box sx={{ position: 'absolute', top: -6, left: -4, opacity: isFixed(v) ? 0.9 : 0, transition: 'opacity .15s', pointerEvents: 'none', zIndex: 3 }}>
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
                          width: ROLL_BADGE_SIZE_PX,
                          height: ROLL_BADGE_SIZE_PX,
                          borderRadius: '50%',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          lineHeight: 1,
                          userSelect: 'none',
                          cursor: (!isSelected(v) || disabled) ? 'default' : 'pointer',
                          opacity: (!isSelected(v)) ? 0 : (disabled ? 0.5 : 1),
                          // When roll strategy is Off, the badge is visually disabled and should
                          // render as a neutral hollow circle (no fill or text), matching the
                          // hover affordance. Disable interactions regardless of selection.
                          pointerEvents: (!isSelected(v) || disabled) ? 'none' : 'auto',
                          border: '1px solid',
                          borderStyle: 'solid',
                          // Enlarge the visual circle without changing layout widths.
                          // Translate right by half the growth so the left edge stays put
                          // and the circle doesn’t cover the label area.
                          transform: `translateX(${((ROLL_BADGE_SIZE_PX * (ROLL_BADGE_SCALE - 1)) / 2)}px) scale(${ROLL_BADGE_SCALE})`,
                          transformOrigin: 'center',
                          // Restrict hit testing to the circular shape so only the circle reacts.
                          clipPath: 'circle(50% at 50% 50%)',
                          // Roll cap (red) takes visual precedence over Wildcard/Min (green)
                          borderColor: disabled
                            ? 'text.secondary'
                            : (max !== undefined
                                ? 'error.main'
                                : ((isWildcard || hasMin) ? 'success.main' : 'text.secondary')),
                          color: disabled
                            ? 'transparent'
                            : (max !== undefined
                                ? 'error.contrastText'
                                : ((isWildcard || hasMin) ? 'common.white' : 'text.secondary')),
                          bgcolor: disabled
                            ? 'transparent'
                            : (max !== undefined
                                ? 'error.main'
                                : ((isWildcard || hasMin) ? 'success.main' : 'transparent')),
                          zIndex: 1,
                        }}
                      >
                        {(max !== undefined) ? String(max) : (isWildcard ? '★' : (hasMin ? String(min) : ''))}
                      </Box>
                    </Tooltip>
                  </Box>
                )
              }
              return (
                <>
                  {/* Row 1: Any */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: TOGGLE_BUTTON_ANY_MIN_WIDTH_PX, height: TOGGLE_BUTTON_HEIGHT_PX } }}>
                  <ToggleButton value="any">Any</ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary">
                  Click to select; click again to lock (🔒).
                  <br />
                  Roll indicator: click=Min (★0–5), Shift+click=Roll cap (0–4).
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
                    minWidth: TOGGLE_BUTTON_MIN_WIDTH_PX,
                    width: TOGGLE_BUTTON_MIN_WIDTH_PX,
                    height: TOGGLE_BUTTON_HEIGHT_PX,
                    justifyContent: 'center',
                    position: 'relative',
                    boxSizing: 'border-box',
                  },
                  // Default gutters used for centering label
                  '--sub-left-gutter': `${ROLL_BADGE_SIZE_PX}px`,
                  '--sub-right-gutter': `${ROLL_BADGE_SIZE_PX}px`,
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
                    borderColor: 'text.secondary',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover': {
                    '--sub-left-gutter': `${ROLL_BADGE_HOVER_GUTTER_PX}px`,
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-label': {
                    textAlign: 'left',
                    pl: 0,
                  },
                  // Selected state keeps left alignment (like hover)
                  '& .MuiToggleButton-root.Mui-selected': {
                    '--sub-left-gutter': `${ROLL_BADGE_HOVER_GUTTER_PX}px`,
                  },
                  '& .MuiToggleButton-root.Mui-selected .roll-label': {
                    textAlign: 'left',
                    pl: 0,
                  },
                }}
              >
                <ToggleButton value={`${StatVariant.HP_FLAT}`} onClick={(e)=>cycleSubstat(StatVariant.HP_FLAT, e)} sx={buttonBorderSx(StatVariant.HP_FLAT)}><BtnContent label={labelOfVariant(StatVariant.HP_FLAT)} v={StatVariant.HP_FLAT} /></ToggleButton>
                <ToggleButton value={`${StatVariant.HP}`} onClick={(e)=>cycleSubstat(StatVariant.HP, e)} sx={buttonBorderSx(StatVariant.HP)}><BtnContent label={labelOfVariant(StatVariant.HP)} v={StatVariant.HP} /></ToggleButton>
                <ToggleButton value={`${StatVariant.ATK_FLAT}`} onClick={(e)=>cycleSubstat(StatVariant.ATK_FLAT, e)} sx={buttonBorderSx(StatVariant.ATK_FLAT)}><BtnContent label={labelOfVariant(StatVariant.ATK_FLAT)} v={StatVariant.ATK_FLAT} /></ToggleButton>
                <ToggleButton value={`${StatVariant.ATK}`} onClick={(e)=>cycleSubstat(StatVariant.ATK, e)} sx={buttonBorderSx(StatVariant.ATK)}><BtnContent label={labelOfVariant(StatVariant.ATK)} v={StatVariant.ATK} /></ToggleButton>
                <ToggleButton value={`${StatVariant.DEF_FLAT}`} onClick={(e)=>cycleSubstat(StatVariant.DEF_FLAT, e)} sx={buttonBorderSx(StatVariant.DEF_FLAT)}><BtnContent label={labelOfVariant(StatVariant.DEF_FLAT)} v={StatVariant.DEF_FLAT} /></ToggleButton>
                <ToggleButton value={`${StatVariant.DEF}`} onClick={(e)=>cycleSubstat(StatVariant.DEF, e)} sx={buttonBorderSx(StatVariant.DEF)}><BtnContent label={labelOfVariant(StatVariant.DEF)} v={StatVariant.DEF} /></ToggleButton>
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
                    minWidth: TOGGLE_BUTTON_MIN_WIDTH_PX,
                    width: TOGGLE_BUTTON_MIN_WIDTH_PX,
                    height: TOGGLE_BUTTON_HEIGHT_PX,
                    justifyContent: 'center',
                    position: 'relative',
                    boxSizing: 'border-box',
                  },
                  // Default gutters used for centering label
                  '--sub-left-gutter': `${ROLL_BADGE_SIZE_PX}px`,
                  '--sub-right-gutter': `${ROLL_BADGE_SIZE_PX}px`,
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
                    borderColor: 'text.secondary',
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover': {
                    '--sub-left-gutter': `${ROLL_BADGE_HOVER_GUTTER_PX}px`,
                  },
                  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-label': {
                    textAlign: 'left',
                    pl: 0,
                  },
                  // Selected state keeps left alignment (like hover)
                  '& .MuiToggleButton-root.Mui-selected': {
                    '--sub-left-gutter': `${ROLL_BADGE_HOVER_GUTTER_PX}px`,
                  },
                  '& .MuiToggleButton-root.Mui-selected .roll-label': {
                    textAlign: 'left',
                    pl: 0,
                  },
                }}
              >
                <ToggleButton value={`${StatVariant.SPD}`} onClick={(e)=>cycleSubstat(StatVariant.SPD, e)} sx={buttonBorderSx(StatVariant.SPD)} data-tour-id="builder.substat.spd"><BtnContent label={labelOfVariant(StatVariant.SPD)} v={StatVariant.SPD} /></ToggleButton>
                <ToggleButton value={`${StatVariant.RES}`} onClick={(e)=>cycleSubstat(StatVariant.RES, e)} sx={buttonBorderSx(StatVariant.RES)}><BtnContent label={labelOfVariant(StatVariant.RES)} v={StatVariant.RES} /></ToggleButton>
                <ToggleButton value={`${StatVariant.ACC}`} onClick={(e)=>cycleSubstat(StatVariant.ACC, e)} sx={buttonBorderSx(StatVariant.ACC)}><BtnContent label={labelOfVariant(StatVariant.ACC)} v={StatVariant.ACC} /></ToggleButton>
                <ToggleButton value={`${StatVariant.CR}`} onClick={(e)=>cycleSubstat(StatVariant.CR, e)} sx={buttonBorderSx(StatVariant.CR)} data-tour-id="builder.substat.cr"><BtnContent label={labelOfVariant(StatVariant.CR)} v={StatVariant.CR} /></ToggleButton>
                <ToggleButton value={`${StatVariant.CDMG}`} onClick={(e)=>cycleSubstat(StatVariant.CDMG, e)} sx={buttonBorderSx(StatVariant.CDMG)} data-tour-id="builder.substat.cdmg"><BtnContent label={labelOfVariant(StatVariant.CDMG)} v={StatVariant.CDMG} /></ToggleButton>
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
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })} data-tour-id="builder.slots">
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Apply this config only to these gear slots."}><span>Slots</span></Tooltip></FormLabel>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
            {artifactTypeIconList.map(({ id, name, Icon }) => {
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
                    data-tour-id={name === 'Boots' ? 'builder.slot.boots' : undefined}
                >
                  <Icon fontSize="medium" />
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
          rowGap: 0.5,
          alignItems: 'start',
          alignContent: 'start',
          alignSelf: 'start',
          borderRadius: 1,
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
        <FormControl sx={{ m: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            {/* Required substats */}
            <FormControl sx={{ m: 0 }}>
              <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"How many of your picked substats the item must have. Locked substats always count."}><span>Required substats</span></Tooltip></FormLabel>
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
              data-tour-id="builder.required"
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
                <Tooltip title={"Minimum total rolls across your picked substats (sum). 0 means no aggregate minimum. Early milestones only show rows that can still reach this sum by +16."}>
                  <span>Min required rolls</span>
                </Tooltip>
              </FormLabel>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={(cfg.autoMinRequiredRolls ? 'auto' : String((cfg.minRequiredRolls ?? 0)))}
                onChange={(_, v) => {
                  if (!v) return
                  if (v === 'auto') {
                    // Turning global min to Auto (0) may deactivate Milestone Thresholds
                    // when there are no per‑stat mins; if so, reset mode to Early.
                    const bV = (cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
                    const hasPerStatMin = Object.values(bV).some(x => typeof x?.min === 'number' && (x.min ?? 0) > 0)
                    const willBeActive = hasPerStatMin // global min becomes 0 here
                    onChange({
                      ...cfg,
                      autoMinRequiredRolls: true,
                      minRequiredRolls: 0,
                      ...(!willBeActive ? { earlyKeepMode: 'early' as const } : {}),
                    })
                    return
                  }
                  const next = Math.max(0, Math.min(5, Number(v))) as 0|1|2|3|4|5
                  onChange({ ...cfg, autoMinRequiredRolls: false, minRequiredRolls: next })
                }}
              data-tour-id="builder.min-rolls"
              >
                <ToggleButton value="auto">Auto</ToggleButton>
                {([0,1,2,3,4,5] as const).map((n) => (
                  <ToggleButton key={n} value={String(n)}>{n}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </FormControl>
            {/* Milestone Thresholds (right of Min required rolls) */}
            {(() => {
              const bV = (cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
              const hasPerStatMin = Object.values(bV).some(v => typeof v?.min === 'number' && v.min! > 0)
              const hasGlobalMin = (cfg.autoMinRequiredRolls === false) && typeof cfg.minRequiredRolls === 'number' && cfg.minRequiredRolls! > 0
              const active = hasPerStatMin || hasGlobalMin
              return (
                <FormControl sx={{ ml: 1 }}>
                  <FormLabel sx={{ mb: 0.5 }}>
                    <Tooltip title={'How thresholds behave before +16 when you set roll minimums. Only affects results if any substat has a Min > 0 or a global Min required rolls is set.'}>
                      <span>Milestone Thresholds</span>
                    </Tooltip>
                  </FormLabel>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={(cfg as BuilderConfig).earlyKeepMode ?? 'early'}
                      onChange={(_, v) => {
                        if (!v) return
                        const mode = (v === 'late' ? 'late' : 'early') as 'early' | 'late'
                        onChange({ ...cfg, earlyKeepMode: mode })
                      }}
                      disabled={!active}
                      data-tour-id="builder.thresholds"
                    >
                      <ToggleButton value="early">Early</ToggleButton>
                      <ToggleButton value="late">Late</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </FormControl>
              )
            })()}
            {/* Substat Values… moved to top row (right of Max Level) */}
          </Box>
        </FormControl>
        {/* Warning area (fixed height, single line, ellipsed, always reserved) */}
        {(() => {
          const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
          const fixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
          const chosenCount = subsV.length
          const fixedCount = fixedV.length
          const warnMin = (chosenCount < cfg.minCount) && !(chosenCount === 0 && (cfg.autoMinRequiredRolls !== false))
          const warnFixed = fixedCount > 4
          // New: when Required equals the number of locked substats while other unlocked
          // substats are also selected, the unlocked ones will never be used. Warn clearly.
          const hasUnlockedSelected = chosenCount > fixedCount
          const warnReqEqLocked = (cfg.minCount === fixedCount) && hasUnlockedSelected
          // New: detect an impossible-by-target case under simple sufficient conditions:
          // If a global MinRequiredRolls is set and even the best-case sum of per‑stat caps
          // across the required number of selected substats is below that minimum, then
          // the target cannot be met. This mirrors cases like single SPD with Max=0 and MinRequired=1.
          const warnImpossible = (() => {
            if (!(cfg.autoMinRequiredRolls === false) || !cfg.minRequiredRolls || cfg.minRequiredRolls <= 0) return false
            if (!Array.isArray(subsV) || subsV.length === 0) return false
            const m = Math.max(cfg.minCount, fixedCount)
            if (m <= 0) return false
            // Build caps per selected variant
            // UI heuristic: default per‑stat cap is 4 rolls, except when the
            // selected rarity can feasibly reach 5 rolls on a single substat
            // (e.g., exact Mythical, ≤ Mythical), or when rarity is Any — the
            // builder models Mythical when needed. This avoids false
            // "impossible" warnings for legitimate 5‑roll targets like ACC
            // with a global MinRequired=5.
            const supportsFive = (() => {
              const rc = Number((cfg as unknown as { rarityCode?: number }).rarityCode ?? 0)
              const mode = (cfg as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode
              if (rc === RarityCode.Mythical || rc === RarityCode.LTE_Mythical) return true
              if (rc === RarityCode.Any) return true
              // When Auto and the global target is 5, treat as 5‑cap capable.
              if (mode === 'auto' && (cfg.minRequiredRolls ?? 0) >= 5) return true
              return false
            })()
            const defaultCap = supportsFive ? 5 : 4
            const capFor = (v: number): number => {
              const b = (cfg.substatRollBoundsV ?? {})[Number(v)]
              const hasMax = (typeof b?.max === 'number' && isFinite(b.max))
              const raw = hasMax ? Number(b!.max) : defaultCap
              return Math.max(0, Math.min(defaultCap, raw))
            }
            const fixedCaps = fixedV.map(capFor)
            const optional = subsV.filter(v => !fixedV.includes(v))
            const optCaps = optional.map(capFor).sort((a,b)=>b-a)
            let sumCaps = 0
            // Include all fixed, then highest optional caps to fill to m
            for (const c of fixedCaps) sumCaps += c
            for (let i = 0; i < Math.max(0, m - fixedCaps.length); i++) { sumCaps += (optCaps[i] ?? 0) }
            return sumCaps < (cfg.minRequiredRolls ?? 0)
          })()
          const msg = warnMin
            ? `Warning: Required (${cfg.minCount}) > chosen (${chosenCount})`
            : (warnFixed
                ? `Warning: Fixed substats (${fixedCount}) exceed 4 — extra will be ignored`
                : (warnReqEqLocked
                    ? `Warning: Required (${cfg.minCount}) equals locked (${fixedCount}); other selected (${chosenCount - fixedCount}) will be ignored`
                    : (warnImpossible
                        ? `Warning: Min required rolls cannot be met by +16 with current per‑stat caps`
                        : '')))
          return (
            // Always reserve a compact space to avoid layout shift while keeping the gap minimal
            <Box sx={{ height: UI_SUBSTAT_WARNING_ROW_HEIGHT_PX, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
              <Typography
                variant="caption"
                color="warning.main"
                sx={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%', lineHeight: 1.2 }}
              >
                {msg}
              </Typography>
            </Box>
          )
        })()}

        {/* Sets multi-select with order toggle and search */}
        <FormControl sx={{ m: 0 }}>
          {/* Header row: label on the left, Manage metasets on the right */}
          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, mb: 0.5 }}>
            <FormLabel sx={{ mb: 0, mr: 1 }}>
              <Tooltip title={"Apply this config only to these sets or metasets."}>
                <span>Sets</span>
              </Tooltip>
            </FormLabel>
            {/* Flexible spacer keeps the label left-aligned and the button right-aligned */}
            <Box ref={setsLeftRef} sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }} />
            <Button size="small" variant="outlined" onClick={openMetaDlg} sx={{ minWidth: 160, whiteSpace: 'nowrap', ml: 'auto' }} data-tour-id="builder.manage-metasets">Manage metasets…</Button>
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
                    const m = metasets.find(x => x.id === id)
                    if (m) names.push(m.name)
                  } else if (t.startsWith('s:')) {
                    const id = Number(t.slice(2))
                    names.push(artifactSetName(id))
                  }
                }
              }
              const text = (any || names.length === 0) ? 'Any' : names.join(', ')
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
            // Build set list per order/search (shared helper keeps behavior consistent)
            const sorted = filterAndSortSetEntries(setsSearch, setsOrder)

            // Show metasets section only when there is at least one visible user metaset. Avoid empty metasets UI.
            const hasMetasetsSection = metasets.some(m => m.show !== false)
            const metasetsMenu: Metaset[] = metasets.filter(m => m.show !== false)

              return (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 520px) auto', gap: 1, alignItems: 'start', minWidth: 0, maxWidth: '100%' }}>
                <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 32, overflow: 'hidden' }}>
                  {(() => {
                    const selectEl = (
                      <Select
                        size="small"
                        multiple
                        value={selectedTokens}
                        onChange={handleChange}
                        onOpen={(e) => {
                          setMetaSetsMenuOpen(true)
                          try {
                            const el = (e?.currentTarget as HTMLElement | null)
                            const rect = el?.getBoundingClientRect()
                            const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
                            const margin = 8
                            // Theoretical max height depends on whether the Metasets section is present.
                            const theoreticalMax = hasMetasetsSection
                              ? (MENU_MAX_HEIGHT_METASETS_PX + MENU_MAX_HEIGHT_SETS_LIST_PX + MENU_MAX_HEIGHT_EXTRA_BUFFER)
                              : (MENU_MAX_HEIGHT_SETS_LIST_PX + MENU_MAX_HEIGHT_EXTRA_BUFFER)
                            const desiredTop = rect ? Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - theoreticalMax - margin)) : margin
                            const desiredLeft = rect ? Math.floor(rect.left) : margin
                            setSetsMenuAnchorPos({ top: desiredTop, left: desiredLeft })
                            // After the menu mounts, measure and refine the anchor using real height.
                            const refine = () => {
                              try {
                                const paper = setsMenuPaperRef.current
                                const measured = paper ? Math.ceil(paper.offsetHeight) : 0
                                if (rect && measured > 0) {
                                  const maxHeight = Math.min(measured, viewportH - margin * 2) + MENU_MAX_HEIGHT_EXTRA_BUFFER
                                  const top = Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - maxHeight - margin))
                                  setSetsMenuAnchorPos({ top, left: desiredLeft })
                                }
                              } catch {}
                            }
                            // Double rAF to wait for mount + layout
                            requestAnimationFrame(() => requestAnimationFrame(refine))
                          } catch { setSetsMenuAnchorPos(null) }
                        }}
                        onClose={() => { setMetaSetsMenuOpen(false); setHoveredSetMetaId(null); setSetsMenuAnchorPos(null) }}
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
                        data-tour-id="builder.sets"
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX },
                              maxWidth: SETS_MENU_WIDTH_PX,
                              overflowX: 'hidden',
                            },
                            ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el }
                          },
                          MenuListProps: {
                            sx: { width: '100%', maxWidth: '100%' },
                          },
                          ...(setsMenuAnchorPos
                            ? {
                                anchorReference: 'anchorPosition' as const,
                                anchorPosition: setsMenuAnchorPos,
                                transformOrigin: { vertical: 'top', horizontal: 'left' as const },
                              }
                            : {
                                transformOrigin: { vertical: 'top', horizontal: 'left' as const },
                              }),
                        }}
                      >
                      {/* Metasets section in its own scroll area (hidden if none) */}
                      {hasMetasetsSection && (
                        <Box component="li" sx={{ display: 'block', p: 0, m: 0 }}>
                          <Box
                            component="ul"
                            sx={{
                              listStyle: 'none',
                              p: 0,
                              m: 0,
                              maxHeight: MENU_MAX_HEIGHT_METASETS_PX,
                              overflowY: 'auto',
                              pr: `${MENU_SCROLL_GUTTER_PX}px`,
                              scrollbarGutter: 'stable both-edges',
                            }}
                            data-tour-id="menu.metasets.section"
                          >
                            <ListSubheader sx={LIST_SUBHEADER_SX}>Metasets</ListSubheader>
                            {metasetsMenu.map((m) => {
                            const setNames = m.sets.map(artifactSetName).filter(Boolean)
                            const joined = setNames.join(', ')
                            const usedMeta = metasetUsageCounts[m.id] || 0
                            const isSelectedMeta = selectedTokens.includes(`m:${m.id}`)
                            return (
                              <MenuItem
                                key={m.id}
                                value={`m:${m.id}`}
                                selected={isSelectedMeta}
                                onMouseEnter={() => setHoveredSetMetaId(m.id)}
                                onMouseLeave={() => setHoveredSetMetaId((prev) => (prev === m.id ? null : prev))}
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  const token = `m:${m.id}`
                                  const tokensSet = new Set<string>(selectedTokens)
                                  if (tokensSet.has(token)) tokensSet.delete(token); else tokensSet.add(token)
                                  const tokens = Array.from(tokensSet)
                                  const metaIds = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
                                  const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
                                  onChange({ ...cfg, artifactMetaSets: metaIds, artifactSets: setIds })
                                }}
                                sx={(theme) => ({
                                  '&.Mui-selected': {
                                    backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_ALPHA),
                                    '&:hover': { backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_HOVER_ALPHA) },
                                  },
                                })}
                              >
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
                                  {setNames.length > 0 && (
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
                          </Box>
                        </Box>
                      )}
                      {/* Sets section in its own scroll area (icons or list) */}
                      <Box component="li" sx={{ display: 'block', p: 0, m: 0 }}>
                        {/* Keep header outside the scrollable list to avoid width changes when scrollbars appear */}
                        <ListSubheader sx={[LIST_SUBHEADER_SX, { py: 0.5, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, boxSizing: 'border-box', width: `calc(100% - ${MENU_SCROLL_GUTTER_PX}px)` }]}>
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', alignItems: 'center', pr: `${MENU_SCROLL_GUTTER_PX}px` }}>
                            <Box
                              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SetsOrderControls
                                setsSearch={setsSearch}
                                onSetsSearchChange={setSetsSearch}
                                setsOrder={setsOrder}
                                onSetsOrderChange={(v: 'game' | 'az' | 'icons') => v && setSetsOrder(v)}
                                zeroResults={filterAndSortSetEntries(setsSearch, setsOrder).length === 0}
                              />
                            </Box>
                          </Box>
                        </ListSubheader>
                        <Box
                          component="ul"
                          sx={{
                            listStyle: 'none',
                            p: 0,
                            m: 0,
                            ...(setsOrder === 'icons'
                              ? {
                                  // Icon mode: never scroll; grid expands with content
                                  maxHeight: 'none',
                                  height: 'auto',
                                  overflowY: 'visible',
                                }
                              : {
                                  // List modes: fixed height with scrolling
                                  maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX,
                                  height: MENU_MAX_HEIGHT_SETS_LIST_PX,
                                  overflowY: 'auto',
                                }),
                            // Reserve a stable right padding so hover indicators
                            // remain visible and width does not change when scrollbars appear
                            pr: `${MENU_SCROLL_GUTTER_PX}px`,
                            scrollbarGutter: 'stable both-edges' as const,
                          }}
                        >
                          <SetMenuSection
                            title="Sets"
                            sorted={sorted}
                            setsOrder={setsOrder}
                            metasets={metasets}
                            excludeMetasetId={null}
                            setUsageCounts={setUsageCounts}
                            valueForSet={(id) => `s:${id}`}
                            // Header rendered above; keep items-only here
                            hideHeader
                            hoveredMetasetId={hoveredSetMetaId}
                            selectedMetasetIds={(cfg.artifactMetaSets ?? [])}
                            selectedSetIds={selectedTokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))}
                            onToggleSet={(id) => {
                              // Toggle explicit set selection without relying on MUI's internal handler.
                              const prev = new Set<number>(cfg.artifactSets ?? [])
                              if (prev.has(id)) prev.delete(id); else prev.add(id)
                              const nextSets = Array.from(prev)
                              nextSets.sort((a, b) => a - b)
                              onChange({ ...cfg, artifactSets: nextSets })
                            }}
                          />
                        </Box>
                      </Box>
                      </Select>
                    )
                    // Keep a stable wrapper to prevent the Select from remounting
                    // when transitioning from empty to non-empty selections, which
                    // could close the menu after the first click.
                    return (
                      <EllipsisTooltip
                        title={fullRenderedValue}
                        selector=".MuiSelect-select"
                        wrap="block"
                        // Disable while menu is open to avoid layout measurements.
                        disabled={metaSetsMenuOpen}
                      >
                        {selectEl}
                      </EllipsisTooltip>
                    )
                  })()}
                </Box>
                {(() => {
                  const hasAnySelection = ((cfg.artifactMetaSets?.length ?? 0) + (cfg.artifactSets?.length ?? 0)) > 0
                  return (
                    <Button color="warning" onClick={openConfirmClearSets} disabled={!hasAnySelection}>Clear</Button>
                  )
                })()}
              </Box>
            )
          })()}
        </FormControl>
        </Box>

      </Box>

        {/* Metasets dialog (separate component) */}
        <MetasetsDialog
          open={metaDlgOpen}
          onClose={closeMetaDlg}
          metasets={metasets}
          onMetasetsChange={onMetasetsChange}
          onDeleteMetaset={onDeleteMetaset}
          setUsageCounts={setUsageCounts}
          metasetUsageCounts={metasetUsageCounts}
          setsSearch={setsSearch}
          onSetsSearchChange={setSetsSearch}
          setsOrder={setsOrder}
          onSetsOrderChange={(v) => v && setSetsOrder(v)}
          metaSetsMenuOpen={metaSetsMenuOpen}
          setMetaSetsMenuOpen={setMetaSetsMenuOpen}
        />

        <MinimaDialog open={minimaDlgOpen} onClose={closeMinimaDlg} minima={minima} onMinimaChange={onMinimaChange} />

        {/* Confirm Clear Sets selection */}
        <Dialog open={confirmClearSets} onClose={closeConfirmClearSets}>
          <DialogTitle>Clear selected sets?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">This removes all selected sets and metasets for this config.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeConfirmClearSets}>Cancel</Button>
            <Button color="warning" onClick={() => { closeConfirmClearSets(); onChange({ ...cfg, artifactSets: [], artifactMetaSets: [] }) }}>Clear</Button>
          </DialogActions>
        </Dialog>

      

      

      {/* Small separator above action buttons (matching the one below) */}
      <Divider sx={{ my: 1, opacity: 0.5 }} />

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Button onClick={onAddToCustom} data-tour-id="builder.add-config">{editingIndex !== null ? 'Insert after selected' : 'Add as new config'}</Button>
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
          <DialogTitle>Reset builder to defaults?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">This clears the current builder fields and selections.</Typography>
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
                minLevel: 0,
                maxLevel: 16,
                // Legacy fields retained for back‑compat; UI uses min/max levels now
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
      <Divider sx={{ mt: 1, opacity: 0.5 }} />
    </Box>
  )
}
