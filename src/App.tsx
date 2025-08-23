import { useMemo, useState } from 'react'
import { parseHsfFile } from './lib/hsf'
import { formatArtifactTypes, rarityCodeToName, statNameFromId, statIsAny, statNameSort, formatRank, formatLevel, formatArtifactSets, formatMainStat, rankCodes, rarityCodes, rarityCodesFriendly, artifactTypeNames, artifactSetNames } from './lib/types'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { buildHsfRules, mainStatOptions, substatOptions, LEVELS, type BuilderConfig } from './lib/hsfBuilder'

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
  const normalized: BuilderConfig = {
    name: typeof input.name === 'string' ? input.name : '',
    keep: Boolean(input.keep ?? true),
    rankCode,
    rarityCode,
    mainStat: mainStat.any ? { any: true } : { any: false, id: Number(mainStat.id), f: mainStat.f !== undefined ? Number(mainStat.f) : undefined },
    startLevel: [0,4,8,12,16].includes(input.startLevel) ? input.startLevel : 0,
    generateRollPermutations: Boolean(input.generateRollPermutations ?? true),
    substats: Array.isArray(input.substats) ? input.substats.map((s: any) => ({ id: Number(s.id), isFlat: Boolean(s.isFlat) })) : [],
    minCount: ([0,1,2,3,4] as const).includes(input.minCount) ? input.minCount : 2,
    artifactTypes: Array.isArray(input.artifactTypes) ? input.artifactTypes.map((x: any) => Number(x)) : undefined,
    artifactSets: Array.isArray(input.artifactSets) ? input.artifactSets.map((x: any) => Number(x)) : undefined,
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
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ListSubheader,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import { Chip as MuiChip, IconButton, Tooltip, ToggleButton, ToggleButtonGroup, TextField as MuiTextField } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import GavelIcon from '@mui/icons-material/Gavel'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import ShieldIcon from '@mui/icons-material/Shield'
import BackHandIcon from '@mui/icons-material/BackHand'
import CheckroomIcon from '@mui/icons-material/Checkroom'
import HikingIcon from '@mui/icons-material/Hiking'
import DiamondIcon from '@mui/icons-material/Diamond'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import FlagIcon from '@mui/icons-material/Flag'

export default function App() {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  const [customCfgs, setCustomCfgs] = useState<BuilderConfig[]>([])
  const [selectedCfgIdx, setSelectedCfgIdx] = useState<number | null>(null)
  const [builder, setBuilder] = useState<BuilderConfig>({
    name: '',
    keep: true,
    rankCode: 0,
    rarityCode: 4,
    mainStat: { any: true },
    startLevel: 0,
    generateRollPermutations: true,
    substats: [],
    minCount: 2,
  })
  // removed preview-generated rule count state for a cleaner UI
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)

  const mergedRules = useMemo(() => {
    const base = hsf?.Rules ?? []
    const customs = customCfgs.flatMap(c => buildHsfRules(c))
    return base.concat(customs)
  }, [hsf, customCfgs])

  

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
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" fontWeight={700}>RSL Sellfile Creator</Typography>
        <Typography variant="body2" color="text.secondary">
          Build and preview sell files for RSL Helper.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Unofficial utility — not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.
        </Typography>
      </Box>

      

      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Base Sell File (.hsf)</Typography>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap' }}>
            <Button component="label">
              Load .hsf / JSON
              <input hidden type="file" accept=".hsf,application/json" onChange={onHsfUpload} />
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
            <Typography variant="caption" color="text.secondary">
              {hsf ? `Loaded ${hsf.Rules.length} base rules` : 'Load a base .hsf to preview merges'}
            </Typography>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Build HSF Rules (Permutations)</Typography>
          <BuilderPanel
            cfg={builder}
            onChange={setBuilder}
            onAddToCustom={() => {
              setCustomCfgs(prev => prev.concat(builder))
            }}
            editingIndex={selectedCfgIdx}
            onUpdateSelected={() => {
              if (selectedCfgIdx === null) return
              setCustomCfgs(prev => prev.map((c, i) => (i === selectedCfgIdx ? builder : c)))
            }}
          />
          
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Custom Rules (HSFR)</Typography>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap' }}>
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
                const blob = new Blob([JSON.stringify({ Configs: customCfgs }, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'custom.hsfr'
                a.click()
                URL.revokeObjectURL(url)
              }}
              disabled={!customCfgs.length}
            >
              Save .hsfr
            </Button>
            <Button color="warning" onClick={() => setConfirmClearOpen(true)} disabled={!customCfgs.length}>Clear custom</Button>
            <Chip label={`${customCfgs.length} config(s)`} size="small" />
          </Stack>

          {customCfgs.length > 0 && (
            <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {customCfgs.map((c, idx) => (
                <ConfigChip
                  key={idx}
                  index={idx}
                  cfg={c}
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
                />
              ))}
            </Box>
          )}
        </Paper>

        

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6">Merged Preview</Typography>
            <Chip label={`${mergedRules.length} total rule(s)`} size="small" />
            <Box sx={{ flex: 1 }} />
            <Button
              onClick={() => {
                const file: HsfFile = { Rules: mergedRules }
                const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'merged.hsf'
                a.click()
                URL.revokeObjectURL(url)
              }}
              disabled={!mergedRules.length}
            >
              Download merged .hsf
            </Button>
          </Stack>
          {mergedRules.length ? (
            <HsfRulesTable rules={mergedRules} />
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
        <DialogTitle>Clear custom configurations?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">This will remove all saved custom rule configurations (HSFR). This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenClear(false)}>Cancel</Button>
          <Button color="error" onClick={() => { setOpenClear(false); onConfirmClear() }}>Remove all</Button>
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

function HsfRulesTable({ rules }: { rules: HsfRule[] }) {
  const cols: Array<{ key: keyof HsfRule | 'Idx' | 'SubstatsSummary' | 'ArtifactTypeNames' | 'ArtifactSetNames' | 'RarityNames' | 'MainStatName' | 'RankLabel' | 'LevelLabel'; label: string }>
    = [
      { key: 'Idx', label: 'Idx' },
      { key: 'Keep', label: 'Keep' },
      { key: 'Use', label: 'Use' },
      // { key: 'IsRuleTypeAND', label: 'AND' }, // Not useful atm
      { key: 'ArtifactSetNames', label: 'Sets' },
      { key: 'ArtifactTypeNames', label: 'Slot' },
      { key: 'RankLabel', label: 'Rank' },
      { key: 'RarityNames', label: 'Rarity' },
      { key: 'MainStatName', label: 'Main Stat' },
      { key: 'LevelLabel', label: 'Level' },
      { key: 'Faction', label: 'Faction' },
      { key: 'SubstatsSummary', label: 'Substats' },
    ]

  const summarizeSubstats = (s: HsfRule['Substats']) => {
    const nonAny = s?.filter(Boolean)?.filter(x => !statIsAny(x.ID)).sort(statNameSort);
    return nonAny?.map((x) => `${ x.Condition === '¬' ? x.Condition : '' }${ statNameFromId(x.ID, x.IsFlat) } ${ (!x.Condition || x.Condition === '¬') ? '' : x.Condition } ${ (x.Condition === '>=' || x.Condition === '<=') ? x.Value : '' }`.trim()).join(' | ');
  }

  return (
    <Box>
      <TableContainer sx={{ maxHeight: 960 }}>
        <Table stickyHeader size="small">
          <TableHead>
          <TableRow>
            {cols.map((c) => (
              <TableCell key={String(c.key)} sx={{ fontWeight: 600 }}>
                {c.label}
              </TableCell>
            ))}
          </TableRow>
          </TableHead>
          <TableBody>
          {rules.map((r, i) => (
            <TableRow key={i} hover>
              {cols.map((c) => {
                let value: any
                if (c.key === 'SubstatsSummary') value = summarizeSubstats(r.Substats)
                else if (c.key === 'Keep') value = r.Keep ? 'Keep' : 'Sell'
                else if (c.key === 'Use') value = r.Use ? '✓' : '-'
                else if (c.key === 'ArtifactTypeNames') value = formatArtifactTypes(r.ArtifactType)
                else if (c.key === 'ArtifactSetNames') value = formatArtifactSets(r.ArtifactSet)
                else if (c.key === 'RankLabel') value = formatRank(r.Rank)
                else if (c.key === 'RarityNames') value = rarityCodeToName(r.Rarity)
                else if (c.key === 'MainStatName') value = formatMainStat(r.MainStatID, r.MainStatF)
                else if (c.key === 'LevelLabel') value = formatLevel(r.LVLForCheck)
                else if (c.key === 'Idx') value = i + 1
                else value = (r as any)[c.key]

                const text = Array.isArray(value) ? value.join(',') : String(value ?? '')
                return (
                  <TableCell key={String(c.key)} sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                    {text}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
          </TableBody>
        </Table>
      </TableContainer>
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
}) {
  const label = `${index + 1}. ${cfg.name || summaryOf(cfg)}`
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        backgroundColor: selected ? 'action.selected' : 'transparent',
        borderRadius: 5,
        pl: 1.2,
        pr: 0.5,
        py: 0.5,
        cursor: 'pointer',
      }}
      onClick={onSelect}
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

function summaryOf(cfg: BuilderConfig): string {
  const parts: string[] = []
  parts.push(cfg.keep ? 'Keep' : 'Sell')
  parts.push(`Rank:${formatRank(cfg.rankCode) || 'Any'}`)
  parts.push(`Rarity:${rarityCodeToName(cfg.rarityCode) || 'Any'}`)
  if (!cfg.mainStat.any) parts.push(`Main:${cfg.mainStat.id}${cfg.mainStat.f === 0 ? '%' : ''}`)
  if (cfg.minCount) parts.push(`Subs:${cfg.minCount}`)
  return parts.join(' | ')
}

function BuilderPanel({ cfg, onChange, onAddToCustom, editingIndex, onUpdateSelected }: {
  cfg: BuilderConfig,
  onChange: (c: BuilderConfig) => void
  onAddToCustom: () => void
  editingIndex: number | null
  onUpdateSelected: () => void
}) {
  const update = <K extends keyof BuilderConfig>(k: K, v: BuilderConfig[K]) => onChange({ ...cfg, [k]: v })
  const [setsOrder, setSetsOrder] = useState<'game' | 'az'>('game')
  const [setsSearch, setSetsSearch] = useState('')

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
          <Box sx={{ display: 'flex', alignItems: 'flex-end', height: 56 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.keep ? 'keep' : 'sell'}
              onChange={(_, v) => v && update('keep', v === 'keep')}
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

        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }} title="Choose exact stars or ranges like '≥ 5-Star' or '≤ 6-Star'. 'Any' matches all. Thresholds adjust conservatively.">Rank</FormLabel>
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
            <MenuItem value={String(0)}>{rarityCodeToName(0) || 'All'}</MenuItem>
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>Exact</ListSubheader>
            {[1,2,3,4,5,15].map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code)}</MenuItem>
            ))}
            <Divider sx={{ my: 0.3 }} />
            <ListSubheader sx={{ fontSize: 11, opacity: 0.7, py: 0.25 }}>≥ Ranges</ListSubheader>
            {[8,9,16,7,6].map((code) => (
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

        <FormControl>
          <FormLabel sx={{ mb: 0.5 }} title="Pick the level to start from. Optionally include permutations to cover +4/+8/+12/+16.">Start level</FormLabel>
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
          <FormLabel sx={{ mb: 0.5 }} title="Also build checks for +4/+8/+12/+16 from the selected start level.">Roll permutations</FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.generateRollPermutations ? 'yes' : 'no'}
              onChange={(_, v) => v && update('generateRollPermutations', v === 'yes')}
              sx={{ height: 40 }}
            >
              <ToggleButton value="yes">Yes</ToggleButton>
              <ToggleButton value="no">No</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </FormControl>
        {/* Row 3: Main Stat (left), Choose substats (right) */}
        <FormControl sx={{ gridColumn: '1 / 3' }}>
          <FormLabel sx={{ mb: 0.5 }} title="HP/ATK/DEF can be flat (e.g., HP) or percent (HP%). Others are fixed like SPD, ACC, RES, CR%, CDMG%.">Main Stat</FormLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {/* Row 1: Any */}
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.mainStat.any ? 'any' : `${cfg.mainStat.id}:${cfg.mainStat.f ?? ''}`}
              onChange={(_, v) => {
                if (!v) return
                if (v === 'any') return update('mainStat', { any: true })
                const [id, f] = String(v).split(':')
                update('mainStat', { any: false, id: Number(id), f: f ? Number(f) : undefined })
              }}
              sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: 144 } }}
            >
              <ToggleButton value="any">Any</ToggleButton>
            </ToggleButtonGroup>
            {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.mainStat.any ? 'any' : `${cfg.mainStat.id}:${cfg.mainStat.f ?? ''}`}
              onChange={(_, v) => {
                if (!v) return
                if (v === 'any') return update('mainStat', { any: true })
                const [id, f] = String(v).split(':')
                update('mainStat', { any: false, id: Number(id), f: f ? Number(f) : undefined })
              }}
              sx={{ gap: 0.5, '& .MuiToggleButton-root': { px: 0.75, minWidth: 72 } }}
            >
              <ToggleButton value="1:1">HP</ToggleButton>
              <ToggleButton value="1:0">HP%</ToggleButton>
              <ToggleButton value="2:1">ATK</ToggleButton>
              <ToggleButton value="2:0">ATK%</ToggleButton>
              <ToggleButton value="3:1">DEF</ToggleButton>
              <ToggleButton value="3:0">DEF%</ToggleButton>
            </ToggleButtonGroup>
            {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
            <ToggleButtonGroup
              exclusive
              size="small"
              value={cfg.mainStat.any ? 'any' : `${cfg.mainStat.id}:${cfg.mainStat.f ?? ''}`}
              onChange={(_, v) => {
                if (!v) return
                if (v === 'any') return update('mainStat', { any: true })
                const [id, f] = String(v).split(':')
                update('mainStat', { any: false, id: Number(id), f: f ? Number(f) : undefined })
              }}
              sx={{ gap: 0.5, '& .MuiToggleButton-root': { px: 0.75, minWidth: 72 } }}
            >
              <ToggleButton value="4:">SPD</ToggleButton>
              <ToggleButton value="5:1">RES</ToggleButton>
              <ToggleButton value="6:1">ACC</ToggleButton>
              <ToggleButton value="7:0">CR%</ToggleButton>
              <ToggleButton value="8:0">CDMG%</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </FormControl>

        <FormControl sx={{ gridColumn: '3 / 5' }}>
          <FormLabel sx={{ mb: 0.5 }} title="Select substats to target; set the minimum above. Choose ‘Any’ to allow any substats (equivalent to selecting none).">Choose substats</FormLabel>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              const encode = (id: number, isFlat?: boolean) => `${id}:${isFlat ? 1 : 0}`
              const value: string[] = (cfg.substats?.length ?? 0) === 0
                ? ['any']
                : cfg.substats.map(s => encode(s.id, s.isFlat))
              const handleChange = (_: any, v: string[]) => {
                if (!Array.isArray(v)) return
                const others = v.filter(x => x !== 'any')
                if (others.length === 0) {
                  update('substats', [])
                  return
                }
                const next = others.map(token => {
                  const [idStr, fStr] = String(token).split(':')
                  return { id: Number(idStr), isFlat: fStr === '1' }
                })
                update('substats', next)
              }
              return (
                <>
                  {/* Row 1: Any */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ '& .MuiToggleButton-root': { px: 1.25, minWidth: 144 } }}>
                    <ToggleButton value="any">Any</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ gap: 0.5, '& .MuiToggleButton-root': { px: 0.75, minWidth: 72 } }}>
                    <ToggleButton value="1:1">HP</ToggleButton>
                    <ToggleButton value="1:0">HP%</ToggleButton>
                    <ToggleButton value="2:1">ATK</ToggleButton>
                    <ToggleButton value="2:0">ATK%</ToggleButton>
                    <ToggleButton value="3:1">DEF</ToggleButton>
                    <ToggleButton value="3:0">DEF%</ToggleButton>
                  </ToggleButtonGroup>
                  {/* Row 3: SPD, RES, ACC, CR%, CDMG% */}
                  <ToggleButtonGroup size="small" value={value} onChange={handleChange} sx={{ gap: 0.5, '& .MuiToggleButton-root': { px: 0.75, minWidth: 72 } }}>
                    <ToggleButton value="4:1">SPD</ToggleButton>
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

        {/* Row 4: Min selected substats aligned with Choose substats */}
        <FormControl sx={{ gridColumn: '3 / 5' }}>
          <FormLabel sx={{ mb: 0.5 }} title="How many of your selected substats must be present.">Min selected substats</FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={String(cfg.minCount)}
              onChange={(_, v) => v && update('minCount', Number(v) as any)}
            >
              {([0,1,2,3,4] as const).map((n) => (
                <ToggleButton key={n} value={String(n)}>{n}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography
              variant="caption"
              color="warning.main"
              sx={{ whiteSpace: 'nowrap', visibility: cfg.substats.length < cfg.minCount ? 'visible' : 'hidden' }}
            >
              Warning: Min selected ({cfg.minCount}) &gt; chosen ({cfg.substats.length})
            </Typography>
          </Box>
        </FormControl>
      </Box>

      

      <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 1 }}>
        {/* Slots grid 3x3 with icons */}
        <FormControl>
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

        {/* Sets multi-select with order toggle and search */}
        <FormControl>
          <FormLabel sx={{ mb: 0.5 }} title="Apply this rule only to the selected gear sets.">Sets</FormLabel>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
            <MuiTextField size="small" label="Search sets" value={setsSearch} onChange={(e) => setSetsSearch(e.target.value)} />
            <ToggleButtonGroup size="small" value={setsOrder} exclusive onChange={(_, v) => v && setSetsOrder(v)}>
              <ToggleButton value="game">Game</ToggleButton>
              <ToggleButton value="az">A–Z</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Select
            size="small"
            multiple
            value={(cfg.artifactSets ?? []).map(String)}
            onChange={(e) => update('artifactSets', (e.target.value as string[]).map(Number))}
            renderValue={(selected) => selected.map((s) => artifactSetNames[Number(s)]).join(', ')}
          >
              {(() => {
                // Build list in chosen order and filtered by search
                const entries = Object.entries(artifactSetNames) as Array<[string, string]>
                const filtered = setsSearch
                  ? entries.filter(([, name]) => name.toLowerCase().includes(setsSearch.toLowerCase()))
                  : entries
                const sorted = setsOrder === 'az'
                  ? filtered.sort((a, b) => a[1].localeCompare(b[1]))
                  : filtered.sort((a, b) => Number(a[0]) - Number(b[0]))
                return sorted.map(([id, name]) => (
                  <MenuItem key={id} value={String(id)}>{name}</MenuItem>
                ))
              })()}
          </Select>
        </FormControl>
      </Box>

      

      {/* Choose substats moved up to be on the same row with main stat and min selected */}

      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="outlined" color="inherit" onClick={onUpdateSelected} disabled={editingIndex === null}>Update selected config</Button>
        <Button onClick={onAddToCustom}>Add as new config</Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" color="error" onClick={() => {
          onChange({
            ...cfg,
            keep: true,
            rankCode: 0,
            rarityCode: 4,
            mainStat: { any: true },
            startLevel: 0,
            generateRollPermutations: true,
            minCount: 2,
            substats: [],
            artifactTypes: undefined,
            artifactSets: undefined,
          })
        }}>Reset to defaults</Button>
        {editingIndex !== null && (
          <Typography variant="caption" color="text.secondary">Editing config #{editingIndex + 1}</Typography>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        Note: roll counts are encoded as substat Value thresholds (&gt;= rolls) due to missing exact numeric mappings. Adjust thresholds as needed.
      </Typography>
    </Box>
  )
}
