/**
 * BuilderPanel
 *
 * Main rule-builder UI. Edits a BuilderConfig, manages metasets and minima, and
 * previews generated HSF rules plus obsolete detection. Stateless except for
 * local UI state; all persisted state lives in App.
 */
import React, { useEffect, useRef, useState } from 'react'
import { rarityCodeToName, formatRank, artifactSetNames, factionCodeToName, artifactSetName, StatVariant, RankCode, RarityCode, Faction, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, labelOfVariant, filterAndSortSetEntries } from '../lib/types'
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { artifactTypeIconList } from './artifactTypeIcons'
import EllipsisTooltip from './EllipsisTooltip'
import LockIcon from '@mui/icons-material/Lock'
import ClearIcon from '@mui/icons-material/Clear'
import { ROLL_BADGE_SIZE_PX, ROLL_BADGE_HOVER_GUTTER_PX, UI_BG_TRANSITION, SETS_ORDER_KEY, LIST_SUBHEADER_SX, MENU_SELECTED_BG_ALPHA, MENU_SELECTED_BG_HOVER_ALPHA, MENU_MAX_HEIGHT_METASETS_PX, MENU_MAX_HEIGHT_SETS_ICONS_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_SCROLL_GUTTER_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, SETS_MENU_WIDTH_PX } from '../lib/constants'
import { alpha } from '@mui/material/styles'
export default function BuilderPanel({ cfg, onChange, onAddToCustom, editingIndex, onUpdateSelected, metasets, onMetasetsChange, onDeleteMetaset, minima, onMinimaChange, includeAllExplicitMeta, onIncludeAllExplicitMetaChange, setUsageCounts, metasetUsageCounts, substatColors, hasAnyConfigs, useStatButtonBorders }: {
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
  includeAllExplicitMeta: boolean
  onIncludeAllExplicitMetaChange: (v: boolean) => void
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
  // Help flyout for Count Rolls / Evaluate From / Roll Strategy / Required Substats
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null)
  const [helpPos, setHelpPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  useEffect(() => {
    if (!helpAnchor) return
    const update = () => {
      try {
        setHelpPos({ top: Math.round(window.innerHeight / 2), left: Math.round(window.innerWidth / 2) })
      } catch {}
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
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
        <Box sx={(theme) => ({
          gridColumn: '1 / -1',
          borderRadius: 1,
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <TextField
            label="Rule Name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => { if (nameDraft !== (cfg.name ?? '')) update('name', nameDraft) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
            InputProps={{
              endAdornment: nameDraft ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear rule name"
                    onClick={() => { setNameDraft(''); if ((cfg.name ?? '') !== '') update('name', '') }}
                    edge="end"
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
            fullWidth
          />
        </Box>

        <FormControl sx={(theme) => ({
          gridColumn: '1 / -1',
          borderRadius: 1,
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Choose what this rule does. Keep: matching gear is kept. Sell: matching gear is sold."}><span>Action</span></Tooltip></FormLabel>
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
                <Tooltip title={isEnabled ? 'Enabled in exported file' : 'Disabled in exported file'}>
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Which rarities to match. Ranges include higher or lower rarities."}><span>Rarity</span></Tooltip></FormLabel>
          <Select
            size="small"
            value={String(cfg.rarityCode)}
            onChange={(e: SelectChangeEvent<string>) => update('rarityCode', Number(e.target.value))}
            MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
          >
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={'What rolls we count for keep/sell. From: only rolls after Start Level. All: all rolls up to each level.'}><span>Count Rolls</span></Tooltip></FormLabel>
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Where checking starts (+0, +4, …). ‘Any’ ignores rolls and just checks stats on the item."}><span>Evaluate From</span></Tooltip></FormLabel>
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
            <FormLabel> <Tooltip title={"How strict roll checks are. Off: ignore roll indicators (no roll checks; just whether stats are on the item). Strict: only items that already meet your roll minimum at each level. Potential: also allow items that can still reach it by +16. Auto: chooses for you (Strict unless you set any roll minimums)."}><span>Roll Strategy</span></Tooltip> </FormLabel>
            <Tooltip title="How these settings work (click)">
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
              The rule matches items. If Keep, matching items are kept; if Sell, matching items are sold. Rank, Rarity, Faction, Slots, and Sets filter items first.
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Count Rolls</Typography>
            <Box component="ul" sx={{ pl: 2, mb: 1, mt: 0 }}>
              <li><Typography variant="body2">From: count only rolls after “Evaluate From”.</Typography></li>
              <li><Typography variant="body2">All: count every roll up to each level.</Typography></li>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.25, mb: 0 }}>Example</Typography>
            <Box
              component="ul"
              sx={{
                pl: 2,
                mt: 0,
                mb: 1,
                '& li': { margin: 0, padding: 0 },
                '& li .MuiTypography-root': { lineHeight: 1.05, margin: 0, display: 'block' },
                '& li + li': { marginTop: '0px' },
              }}
            >
              <li><Typography variant="caption" color="text.secondary">Setup: 6★ item with SPD; each SPD roll adds +5. Evaluate From = +8 (8–11).</Typography></li>
              <li><Typography variant="caption" color="text.secondary">From: count only rolls after +8 → SPD +5, +10, +15 …</Typography></li>
              <li><Typography variant="caption" color="text.secondary">All: count all rolls up to each level → SPD +15, +20, +25 …</Typography></li>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Evaluate From</Typography>
            <Box component="ul" sx={{ pl: 2, mb: 1, mt: 0 }}>
              <li><Typography variant="body2">Pick where checking starts: +0, +4, +8, +12, +16.</Typography></li>
              <li><Typography variant="body2">Any: ignore rolls; check only which stats the item has (sets Strategy to Off).</Typography></li>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Roll Strategy</Typography>
            <Box component="ul" sx={{ pl: 2, mb: 1, mt: 0 }}>
              <li><Typography variant="body2">Off: ignore roll indicators (no roll checks).</Typography></li>
              <li><Typography variant="body2">Auto: chooses for you (Strict unless you set any roll minimums).</Typography></li>
              <li><Typography variant="body2">Strict: only items that already meet your roll minimum at each level.</Typography></li>
              <li><Typography variant="body2">Potential: also allow items that can still reach it by +16.</Typography></li>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Substats</Typography>
            <Box component="ul" sx={{ pl: 2, mb: 1, mt: 0 }}>
              <li><Typography variant="body2">Click to select; click again to lock (🔒) so the item must have it.</Typography></li>
              <li><Typography variant="body2">Use the round roll indicator on each selected stat: click for Min (★, 1–5), Shift+click for Max (0–4), right‑click goes backward.</Typography></li>
              <li><Typography variant="body2">Min means at least that many rolls by the target level. Max limits rolls on that stat (0 forbids rolls).</Typography></li>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Required substats</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              How many of your picked substats the item must have. Locked substats always count. “Auto” sets it to min(4, number selected) and keeps it in sync as you add or remove substats.
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Min required rolls</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Minimum total rolls across your picked substats (sum). Example: 3 means your chosen substats have at least 3 rolls in total. With Count Rolls = From and Start +8, only rolls gained after +8 are counted; with All, rolls from before are also counted. In Strategy = Auto, setting this above 0 makes Auto use Potential.
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
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: TOGGLE_BUTTON_ANY_MIN_WIDTH_PX, height: TOGGLE_BUTTON_HEIGHT_PX } }}>
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
                    <ToggleButton value={`${StatVariant.SPD}`} sx={buttonBorderSx(StatVariant.SPD)}>{labelOfVariant(StatVariant.SPD)}</ToggleButton>
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
        })}>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Pick substats. Click to select; click again to lock (🔒) so it must be on the item. Use the round roll indicator to set Min (green) or Max (red) rolls."}><span>Substats</span></Tooltip></FormLabel>
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
              // Left click cycles Min (*,1..5,*). Shift-click cycles Max (*,0..4,*).
              // Right click cycles backwards (Min: *→5→…→1→*; Max: *→4→…→0→*).
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
                const max = (typeof b?.max === 'number' && isFinite(b.max)) ? Math.max(0, Math.min(4, Number(b?.max))) : undefined
                // no 'unset' state in UI; default is ★
                const disabled = cfg.rollMode === 'off'
                const title = disabled
                  ? 'Roll indicator disabled.'
                  : 'Roll indicator: click for Min (★, 1–5). Shift+click for Max (0–4). Right‑click goes backward. Min is green; Max is red.'
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
                          borderColor: disabled
                            ? 'text.secondary'
                            : (isWildcard
                                ? 'success.main'
                                : (max !== undefined
                                    ? 'error.main'
                                    : (hasMin ? 'success.main' : 'text.secondary'))),
                          color: disabled
                            ? 'transparent'
                            : (isWildcard
                                ? 'common.white'
                                : (max !== undefined
                                    ? 'error.contrastText'
                                    : (hasMin ? 'common.white' : 'text.secondary'))),
                          bgcolor: disabled
                            ? 'transparent'
                            : (isWildcard
                                ? 'success.main'
                                : (max !== undefined
                                    ? 'error.main'
                                    : (hasMin ? 'success.main' : 'transparent'))),
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
                <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: TOGGLE_BUTTON_ANY_MIN_WIDTH_PX, height: TOGGLE_BUTTON_HEIGHT_PX } }}>
                  <ToggleButton value="any">Any</ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary">
                  Click to select; click again to lock (🔒).
                  <br />
                  Roll indicator: click=Min (★1–5), Shift+click=Max (0–4).
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
                <ToggleButton value={`${StatVariant.SPD}`} onClick={(e)=>cycleSubstat(StatVariant.SPD, e)} sx={buttonBorderSx(StatVariant.SPD)}><BtnContent label={labelOfVariant(StatVariant.SPD)} v={StatVariant.SPD} /></ToggleButton>
                <ToggleButton value={`${StatVariant.RES}`} onClick={(e)=>cycleSubstat(StatVariant.RES, e)} sx={buttonBorderSx(StatVariant.RES)}><BtnContent label={labelOfVariant(StatVariant.RES)} v={StatVariant.RES} /></ToggleButton>
                <ToggleButton value={`${StatVariant.ACC}`} onClick={(e)=>cycleSubstat(StatVariant.ACC, e)} sx={buttonBorderSx(StatVariant.ACC)}><BtnContent label={labelOfVariant(StatVariant.ACC)} v={StatVariant.ACC} /></ToggleButton>
                <ToggleButton value={`${StatVariant.CR}`} onClick={(e)=>cycleSubstat(StatVariant.CR, e)} sx={buttonBorderSx(StatVariant.CR)}><BtnContent label={labelOfVariant(StatVariant.CR)} v={StatVariant.CR} /></ToggleButton>
                <ToggleButton value={`${StatVariant.CDMG}`} onClick={(e)=>cycleSubstat(StatVariant.CDMG, e)} sx={buttonBorderSx(StatVariant.CDMG)}><BtnContent label={labelOfVariant(StatVariant.CDMG)} v={StatVariant.CDMG} /></ToggleButton>
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
        })}>
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Apply this rule only to these gear slots."}><span>Slots</span></Tooltip></FormLabel>
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
          rowGap: 1,
          borderRadius: 1,
          transition: UI_BG_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)') : 'transparent',
        })}>
        <FormControl>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'nowrap' }}>
            {/* Required substats */}
            <FormControl>
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
                <Tooltip title={"Minimum total rolls across your picked substats (sum). If you set this above 0, Auto uses Potential."}>
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
            <Button size="small" variant="outlined" onClick={openMinimaDlg} sx={{ whiteSpace: 'nowrap', minWidth: 160, ml: 'auto' }}>Substat Values…</Button>
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
          <FormLabel sx={{ mb: 0.5 }}><Tooltip title={"Apply this rule only to these sets or metasets."}><span>Sets</span></Tooltip></FormLabel>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, minWidth: 0 }}>
            <Box ref={setsLeftRef} sx={{ minWidth: 0, overflow: 'hidden', width: '100%' }} />
            <Button size="small" variant="outlined" onClick={openMetaDlg} sx={{ minWidth: 160, whiteSpace: 'nowrap' }}>Manage metasets…</Button>
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

            const ALL_META_ID = 'meta__ALL_EXPLICIT'
            const allSets = Object.keys(artifactSetNames).map(Number)
            // Show metasets section only if "All (Explicit)" is enabled or there
            // is at least one visible user metaset. Avoid empty metasets UI.
            const hasMetasetsSection = includeAllExplicitMeta || metasets.some(m => m.show !== false)
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
                          >
                            <ListSubheader sx={LIST_SUBHEADER_SX}>Metasets</ListSubheader>
                            {metasetsMenu.map((m) => {
                            const setNames = m.sets.map(artifactSetName).filter(Boolean)
                            const joined = setNames.join(', ')
                            const isAllExplicit = m.id === ALL_META_ID
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
                          </Box>
                        </Box>
                      )}
                      {/* Sets section in its own scroll area (icons or list) */}
                      <Box component="li" sx={{ display: 'block', p: 0, m: 0 }}>
                        {/* Keep header outside the scrollable list to avoid width changes when scrollbars appear */}
                        <ListSubheader sx={LIST_SUBHEADER_SX}>
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', alignItems: 'center', gap: 1, pr: `${MENU_SCROLL_GUTTER_PX}px` }}>
                            <Typography variant="body2" component="div" sx={{ opacity: 0.9 }}>Sets</Typography>
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
                            maxHeight: setsOrder === 'icons' ? MENU_MAX_HEIGHT_SETS_ICONS_PX : MENU_MAX_HEIGHT_SETS_LIST_PX,
                            height: setsOrder === 'icons' ? MENU_MAX_HEIGHT_SETS_ICONS_PX : MENU_MAX_HEIGHT_SETS_LIST_PX,
                            overflowY: 'auto',
                            // Reserve a stable scrollbar gutter and right padding in list modes
                            pr: setsOrder === 'icons' ? 0 : `${MENU_SCROLL_GUTTER_PX}px`,
                            scrollbarGutter: setsOrder === 'icons' ? 'auto' as const : 'stable both-edges' as const,
                          }}
                        >
                          <SetMenuSection
                            title="Sets"
                            sorted={sorted}
                            setsOrder={setsOrder}
                            metasets={metasets}
                            excludeMetasetId={null}
                            allExplicitMetaId={ALL_META_ID}
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

        <MinimaDialog open={minimaDlgOpen} onClose={closeMinimaDlg} minima={minima} onMinimaChange={onMinimaChange} />

        {/* Confirm Clear Sets selection */}
        <Dialog open={confirmClearSets} onClose={closeConfirmClearSets}>
          <DialogTitle>Clear selected sets?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">This removes all selected sets and metasets for this rule.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeConfirmClearSets}>Cancel</Button>
            <Button color="warning" onClick={() => { closeConfirmClearSets(); onChange({ ...cfg, artifactSets: [], artifactMetaSets: [] }) }}>Clear</Button>
          </DialogActions>
        </Dialog>

      

      

      {/* Small separator above action buttons (matching the one below) */}
      <Divider sx={{ my: 1, opacity: 0.5 }} />

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
      <Divider sx={{ mt: 1, opacity: 0.5 }} />
    </Box>
  )
}
