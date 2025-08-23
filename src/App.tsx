import { useMemo, useState } from 'react'
import { parseHsfFile } from './lib/hsf'
import { formatArtifactTypes, rarityCodeToName, statNameFromId, statIsAny, statNameSort, formatRank, formatLevel, formatArtifactSets, formatMainStat, rankCodes, rarityCodes, artifactTypeNames, artifactSetNames } from './lib/types'
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
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import { Chip as MuiChip, IconButton, Tooltip } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

export default function App() {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  const [customCfgs, setCustomCfgs] = useState<BuilderConfig[]>([])
  const [selectedCfgIdx, setSelectedCfgIdx] = useState<number | null>(null)
  const [builder, setBuilder] = useState<BuilderConfig>({
    name: '',
    keep: true,
    rankCode: 0,
    rarityCode: 3,
    mainStat: { any: true },
    startLevel: 0,
    generateRollPermutations: true,
    substats: [],
    minCount: 2,
  })
  const [builtRules, setBuiltRules] = useState<HsfRule[] | null>(null)
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
            onBuild={() => {
              const rules = buildHsfRules(builder)
              setBuiltRules(rules)
            }}
            onAddToCustom={() => {
              setCustomCfgs(prev => prev.concat(builder))
              setBuiltRules(buildHsfRules(builder))
            }}
            editingIndex={selectedCfgIdx}
            onUpdateSelected={() => {
              if (selectedCfgIdx === null) return
              setCustomCfgs(prev => prev.map((c, i) => (i === selectedCfgIdx ? builder : c)))
              setBuiltRules(buildHsfRules(builder))
            }}
          />
          {builtRules && (
            <Chip sx={{ mt: 1 }} label={`Preview generates ${builtRules.length} rule(s) from current config`} size="small" />
          )}
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

function BuilderPanel({ cfg, onChange, onBuild, onAddToCustom, editingIndex, onUpdateSelected }: {
  cfg: BuilderConfig,
  onChange: (c: BuilderConfig) => void
  onBuild: () => void
  onAddToCustom: () => void
  editingIndex: number | null
  onUpdateSelected: () => void
}) {
  const update = <K extends keyof BuilderConfig>(k: K, v: BuilderConfig[K]) => onChange({ ...cfg, [k]: v })

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

        <FormControl fullWidth>
          <InputLabel id="sel-action">Action</InputLabel>
          <Select
            labelId="sel-action"
            label="Action"
            value={cfg.keep ? 'keep' : 'sell'}
            onChange={(e: SelectChangeEvent<string>) => update('keep', e.target.value === 'keep')}
          >
            <MenuItem value="keep">Keep</MenuItem>
            <MenuItem value="sell">Sell</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="sel-rank">Rank</InputLabel>
          <Select
            labelId="sel-rank"
            label="Rank"
            value={String(cfg.rankCode)}
            onChange={(e: SelectChangeEvent<string>) => update('rankCode', Number(e.target.value))}
          >
            {rankCodes.map((code) => (
              <MenuItem key={code} value={String(code)}>{formatRank(code) || 'Any'}</MenuItem>
            ))}
          </Select>
          <Tooltip title="Rank: choose exact stars or ranges like '≥ 5-Star' or '≤ 6-Star'. 'Any' matches all. Thresholds adjust to a safe star bucket."><IconButton size="small" sx={{ ml: 0.5 }}><InfoOutlinedIcon fontSize="inherit" /></IconButton></Tooltip>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="sel-rarity">Rarity</InputLabel>
          <Select
            labelId="sel-rarity"
            label="Rarity"
            value={String(cfg.rarityCode)}
            onChange={(e: SelectChangeEvent<string>) => update('rarityCode', Number(e.target.value))}
          >
            {rarityCodes.map((code) => (
              <MenuItem key={code} value={String(code)}>{rarityCodeToName(code) || 'All'}</MenuItem>
            ))}
          </Select>
          <Tooltip title="Rarity: pick an exact rarity or a range. For ranges, roll behavior uses a safe assumption (as strict as Legendary/Mythical). 'All' matches every rarity."><IconButton size="small" sx={{ ml: 0.5 }}><InfoOutlinedIcon fontSize="inherit" /></IconButton></Tooltip>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="sel-startlevel">Start level</InputLabel>
          <Select
            labelId="sel-startlevel"
            label="Start level"
            value={String(cfg.startLevel)}
            onChange={(e: SelectChangeEvent<string>) => update('startLevel', Number(e.target.value) as any)}
          >
            {LEVELS.map(l => (
              <MenuItem key={l} value={String(l)}>Level {l}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="sel-mainstat">Main Stat</InputLabel>
          <Select
            labelId="sel-mainstat"
            label="Main Stat"
            value={cfg.mainStat.any ? 'any' : `${cfg.mainStat.id}:${cfg.mainStat.f ?? ''}`}
            onChange={(e: SelectChangeEvent<string>) => {
              const v = e.target.value
              if (v === 'any') return update('mainStat', { any: true })
              const [id, f] = v.split(':')
              update('mainStat', { any: false, id: Number(id), f: f ? Number(f) : undefined })
            }}
          >
            <MenuItem value="any">Any</MenuItem>
            {mainStatOptions.filter(o => o.id !== -1).map(o => (
              <MenuItem key={`${o.id}:${o.f ?? ''}`} value={`${o.id}:${o.f ?? ''}`}>{o.label}</MenuItem>
            ))}
          </Select>
          <Tooltip title="Main Stat: HP/ATK/DEF can be flat (e.g., HP) or percent (HP%). Others are fixed types like SPD, ACC, RES, CR%, CDMG%."><IconButton size="small" sx={{ ml: 0.5 }}><InfoOutlinedIcon fontSize="inherit" /></IconButton></Tooltip>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="sel-mincount">Min selected substats</InputLabel>
          <Select
            labelId="sel-mincount"
            label="Min selected substats"
            value={String(cfg.minCount)}
            onChange={(e: SelectChangeEvent<string>) => update('minCount', Number(e.target.value) as any)}
          >
            <MenuItem value={String(0)}>0</MenuItem>
            <MenuItem value={String(1)}>1</MenuItem>
            <MenuItem value={String(2)}>2</MenuItem>
            <MenuItem value={String(3)}>3</MenuItem>
            <MenuItem value={String(4)}>4</MenuItem>
          </Select>
          <Tooltip title="Select K substats below and set the minimum count required. The builder generates combinations of the selected substats."><IconButton size="small" sx={{ ml: 0.5 }}><InfoOutlinedIcon fontSize="inherit" /></IconButton></Tooltip>
        </FormControl>
      </Box>

      <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 1 }}>
        <FormControl fullWidth>
          <InputLabel id="sel-types">Slot filter</InputLabel>
          <Select
            multiple
            labelId="sel-types"
            label="Slot filter"
            value={(cfg.artifactTypes ?? []).map(String)}
            onChange={(e) => update('artifactTypes', (e.target.value as string[]).map(Number))}
            renderValue={(selected) => selected.map((s) => artifactTypeNames[Number(s)]).join(', ')}
          >
            {Object.entries(artifactTypeNames).map(([id, name]) => (
              <MenuItem key={id} value={String(id)}>{name}</MenuItem>
            ))}
          </Select>
          <Tooltip title="Apply this rule only to the selected gear slots."><IconButton size="small" sx={{ ml: 0.5 }}><InfoOutlinedIcon fontSize="inherit" /></IconButton></Tooltip>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="sel-sets">Set filter</InputLabel>
          <Select
            multiple
            labelId="sel-sets"
            label="Set filter"
            value={(cfg.artifactSets ?? []).map(String)}
            onChange={(e) => update('artifactSets', (e.target.value as string[]).map(Number))}
            renderValue={(selected) => selected.map((s) => artifactSetNames[Number(s)]).join(', ')}
          >
            {Object.entries(artifactSetNames).map(([id, name]) => (
              <MenuItem key={id} value={String(id)}>{name}</MenuItem>
            ))}
          </Select>
          <Tooltip title="Apply this rule only to the selected gear sets."><IconButton size="small" sx={{ ml: 0.5 }}><InfoOutlinedIcon fontSize="inherit" /></IconButton></Tooltip>
        </FormControl>
      </Box>

      <Box sx={{ mt: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={cfg.generateRollPermutations}
                onChange={(e) => update('generateRollPermutations', e.target.checked)}
              />
            }
            label={<Typography variant="body2">Generate roll permutations at 4, 8, 12, 16</Typography>}
          />
          <Tooltip title="From your start level, we also build checks for +4/+8/+12/+16. Higher rarities can roll substats at these levels, so minima increase. For ranges, we assume the stricter case."><IconButton size="small"><InfoOutlinedIcon fontSize="inherit" /></IconButton></Tooltip>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          If you choose 2 substats at level 0, we presume minimum presence at 0 and generate rules for level 4/8/12/16 with permutations of which substat(s) could have rolled up to that point.
        </Typography>
      </Box>

      <Box sx={{ mt: 1 }}>
        <Typography variant="body2" sx={{ mb: 0.5 }}>Choose substats:</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {substatOptions.map(s => {
            const selIdx = cfg.substats.findIndex(x => x.id === s.id && Boolean(x.isFlat) === Boolean(s.isFlat))
            const checked = selIdx >= 0
            return (
              <FormControlLabel
                key={`${s.id}:${s.isFlat ? 1 : 0}`}
                sx={{ m: 0, px: 1, py: 0.25, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                control={
                  <Checkbox
                    checked={checked}
                    onChange={(e) => {
                      const arr = [...cfg.substats]
                      if (e.target.checked) arr.push({ id: s.id, isFlat: s.isFlat })
                      else arr.splice(selIdx, 1)
                      update('substats', arr)
                    }}
                    size="small"
                  />
                }
                label={<Typography variant="caption">{s.label}</Typography>}
              />
            )
          })}
        </Box>
      </Box>

      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button onClick={onBuild}>Preview generated rule count</Button>
        <Button variant="outlined" color="inherit" onClick={onUpdateSelected} disabled={editingIndex === null}>Update selected config</Button>
        <Button onClick={onAddToCustom}>Add as new config</Button>
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
