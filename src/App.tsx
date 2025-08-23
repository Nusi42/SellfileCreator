import { useMemo, useState } from 'react'
import type { SellRuleSet, SellFileItem, GearItem } from './lib/types'
import { defaultRuleSet } from './lib/defaultRuleSet'
import { generateSellList } from './lib/sellFile'
import { parseHsfFile } from './lib/hsf'
import { formatArtifactTypes, rarityCodeToName, statNameFromId, statIsAny, statNameSort, formatRank, formatLevel, formatArtifactSets, formatMainStat } from './lib/types'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { buildHsfRules, mainStatOptions, substatOptions, LEVELS, type BuilderConfig } from './lib/hsfBuilder'

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
  Chip,
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'

export default function App() {
  const [rules, setRules] = useState<SellRuleSet>(defaultRuleSet)
  const [gear, setGear] = useState<GearItem[]>([])
  const [output, setOutput] = useState<SellFileItem[] | null>(null)
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  const [builder, setBuilder] = useState<BuilderConfig>({
    keep: true,
    rank: { kind: 'any' },
    rarityExact: 'Rare',
    mainStat: { any: true },
    startLevel: 0,
    generateRollPermutations: true,
    substats: [],
    minCount: 2,
  })
  const [builtRules, setBuiltRules] = useState<HsfRule[] | null>(null)

  const prettyOutput = useMemo(() =>
    output ? JSON.stringify(output, null, 2) : '',
  [output])

  function onRulesChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    try {
      const parsed = JSON.parse(e.target.value)
      setRules(parsed)
    } catch {
      // ignore parse errors to allow editing
    }
  }

  function onGearUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const items: GearItem[] = Array.isArray(parsed) ? parsed : parsed.items ?? []
        setGear(items)
      } catch (err) {
        console.error('Failed to parse gear file', err)
      }
    }
    reader.readAsText(file)
  }

  function onGenerate() {
    const list = generateSellList(gear, rules)
    setOutput(list)
  }

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
          Create and validate sell files for RSL Helper.
        </Typography>
      </Box>

      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">1) Load Gear Export</Typography>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
            <Button component="label">
              Choose JSON
              <input hidden type="file" accept="application/json" onChange={onGearUpload} />
            </Button>
            <Typography variant="caption" color="text.secondary">
              Supported: JSON export from your tooling. Shape is configurable.
            </Typography>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Preview RSL Helper Sell File (.hsf)</Typography>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
            <Button component="label">
              Load .hsf / JSON
              <input hidden type="file" accept=".hsf,application/json" onChange={onHsfUpload} />
            </Button>
            <Typography variant="caption" color="text.secondary">
              {hsf ? `Loaded ${hsf.Rules.length} rules` : 'Load a sample .hsf to inspect its rules'}
            </Typography>
          </Stack>
          {hsf && (
            <Box sx={{ mt: 2 }}>
              <HsfRulesTable rules={hsf.Rules} />
            </Box>
          )}
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
            onAppend={() => {
              const rules = buildHsfRules(builder)
              const existing = hsf ?? { Rules: [] as HsfRule[] }
              const merged: HsfFile = { Rules: [...existing.Rules, ...rules] }
              setHsf(merged)
              setBuiltRules(rules)
            }}
          />
          {builtRules && (
            <Box sx={{ mt: 1 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Chip label={`Generated ${builtRules.length} rule(s)`} size="small" />
                <Button onClick={() => {
                  const file: HsfFile = { Rules: builtRules }
                  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'rules.hsf'
                  a.click()
                  URL.revokeObjectURL(url)
                }}>Download .hsf</Button>
                <Typography variant="caption" color="text.secondary">Use Append to merge into current view</Typography>
              </Stack>
              <TextField
                sx={{ mt: 1 }}
                fullWidth
                multiline
                minRows={8}
                value={JSON.stringify({ Rules: builtRules }, null, 2)}
                InputProps={{ readOnly: true, sx: { fontFamily: 'ui-monospace, monospace', fontSize: 13 } }}
              />
            </Box>
          )}
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">2) Edit Sell Rules</Typography>
          <TextField
            sx={{ mt: 1 }}
            fullWidth
            multiline
            defaultValue={JSON.stringify(rules, null, 2)}
            onChange={onRulesChange}
            spellCheck={false}
            minRows={12}
            InputProps={{ sx: { fontFamily: 'ui-monospace, monospace', fontSize: 13 } }}
          />
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button onClick={onGenerate} disabled={!gear.length}>Generate Sell List</Button>
            <Typography variant="caption" color="text.secondary">
              {gear.length ? `${gear.length} gear items loaded` : 'No gear loaded'}
            </Typography>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">3) Output Preview</Typography>
          <TextField
            sx={{ mt: 1 }}
            fullWidth
            multiline
            value={prettyOutput}
            placeholder="Generated sell file will appear here"
            InputProps={{ readOnly: true, sx: { fontFamily: 'ui-monospace, monospace', fontSize: 13 } }}
            minRows={12}
          />
        </Paper>

        <Box>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="caption" color="text.secondary">
            Draft prototype — rules and formats are placeholders pending your inputs.
          </Typography>
        </Box>
      </Stack>
    </Container>
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

  // Render first N rules to keep UI snappy for very large files
  const MAX_ROWS = 200
  const rows = rules.slice(0, MAX_ROWS)

  return (
    <Box sx={{ overflowX: 'auto' }}>
      {rules.length > MAX_ROWS && (
        <Typography variant="caption" color="text.secondary">
          Showing first {MAX_ROWS} of {rules.length} rules
        </Typography>
      )}
      <Table size="small" sx={{ mt: 1 }}>
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
          {rows.map((r, i) => (
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
    </Box>
  )
}

function BuilderPanel({ cfg, onChange, onBuild, onAppend }: {
  cfg: BuilderConfig,
  onChange: (c: BuilderConfig) => void
  onBuild: () => void
  onAppend: () => void
}) {
  const update = <K extends keyof BuilderConfig>(k: K, v: BuilderConfig[K]) => onChange({ ...cfg, [k]: v })

  return (
    <Box>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
        gap: 1,
      }}>
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
          <InputLabel id="sel-rank">Min Rank</InputLabel>
          <Select
            labelId="sel-rank"
            label="Min Rank"
            value={cfg.rank.kind === 'any' ? 'any' : cfg.rank.kind === 'min' ? `min-${cfg.rank.value}` : `exact-${cfg.rank.value}`}
            onChange={(e: SelectChangeEvent<string>) => {
              const v = e.target.value
              if (v === 'any') return update('rank', { kind: 'any' })
              const [mode, num] = v.split('-')
              const n = Number(num) as 1|2|3|4|5|6
              update('rank', mode === 'min' ? { kind: 'min', value: n } : { kind: 'exact', value: n })
            }}
          >
            <MenuItem value="any">Any</MenuItem>
            <MenuItem value="min-1">≥ 1-Star</MenuItem>
            <MenuItem value="min-2">≥ 2-Star</MenuItem>
            <MenuItem value="min-3">≥ 3-Star</MenuItem>
            <MenuItem value="min-4">≥ 4-Star</MenuItem>
            <MenuItem value="min-5">≥ 5-Star</MenuItem>
            <MenuItem value="exact-6">6-Star only</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="sel-rarity">Rarity (exact)</InputLabel>
          <Select
            labelId="sel-rarity"
            label="Rarity (exact)"
            value={cfg.rarityExact}
            onChange={(e: SelectChangeEvent<string>) => update('rarityExact', e.target.value as any)}
          >
            <MenuItem value="Common">Common</MenuItem>
            <MenuItem value="Uncommon">Uncommon</MenuItem>
            <MenuItem value="Rare">Rare</MenuItem>
            <MenuItem value="Epic">Epic</MenuItem>
            <MenuItem value="Legendary">Legendary</MenuItem>
            <MenuItem value="Mythical">Mythical</MenuItem>
          </Select>
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
        </FormControl>
      </Box>

      <Box sx={{ mt: 1 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={cfg.generateRollPermutations}
              onChange={(e) => update('generateRollPermutations', e.target.checked)}
            />
          }
          label={<Typography variant="body2">Generate roll permutations at 4, 8, 12, 16</Typography>}
        />
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

      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button onClick={onBuild}>Generate</Button>
        <Button onClick={onAppend}>Append to current HSF</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        Note: roll counts are encoded as substat Value thresholds (&gt;= rolls) due to missing exact numeric mappings. Adjust thresholds as needed.
      </Typography>
    </Box>
  )
}
