import { Box, Button, Chip, Collapse, Divider, FormControl, FormLabel, IconButton, MenuItem, Select, SelectChangeEvent, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import CloseIcon from '@mui/icons-material/Close'
import SetMenuSection from './SetMenuSection'
import { artifactTypeIconFor } from './artifactTypeIcons'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import EllipsisTooltip from './EllipsisTooltip'
import { artifactSetName, artifactTypeName, PREFERRED_ARTIFACT_TYPE_ORDER, StatVariant, labelOfVariant, factionNames, filterAndSortSetEntries } from '../lib/types'
import type { Metaset } from '../lib/metasets'
import React from 'react'
import type { AnyMode, RulesFilterState } from '../lib/rulesFilter'

// UI-only component that lets users filter the preview table. View-only; export ignores filters.
export default function RulesFilterPanel({
  state,
  onChange,
  metasets,
  onClose,
  showFaction,
}: {
  state: RulesFilterState
  onChange: (next: RulesFilterState) => void
  metasets: Metaset[]
  onClose: () => void
  showFaction: boolean
}) {
  // Collapsible sections: persisted; initialized from rules table column visibility on first open this session
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('sellfileCreator.rulesFilter.collapse.v1')
      if (raw) return JSON.parse(raw) as Record<string, boolean>
    } catch {}
    return { sets: false, main: false, sub: false, level: false, slots: false, rank: false, rarity: false, faction: false }
  })
  React.useEffect(() => {
    try { localStorage.setItem('sellfileCreator.rulesFilter.collapse.v1', JSON.stringify(collapsed)) } catch {}
  }, [collapsed])
  React.useEffect(() => {
    try {
      const inited = sessionStorage.getItem('sellfileCreator.rulesFilter.collapseInitialized.v1')
      if (inited) return
      sessionStorage.setItem('sellfileCreator.rulesFilter.collapseInitialized.v1', 'true')
      // Read table columns from localStorage and map visibility to default expanded/collapsed
      const rawCols = localStorage.getItem('sellfileCreator.rulesTableCols.v2')
      const cols = rawCols ? (JSON.parse(rawCols) as Array<{ key: string; visible?: boolean }>) : []
      const vis = new Map(cols.map(c => [c.key, Boolean(c.visible)]))
      const next: Record<string, boolean> = { ...collapsed }
      // collapsed = !visible (expanded when visible)
      next.sets = !(vis.get('ArtifactSetNames') ?? true)
      next.main = !(vis.get('MainStatName') ?? true)
      next.sub = !(vis.get('SubstatsSummary') ?? true)
      next.level = !(vis.get('LevelLabel') ?? true)
      next.slots = !(vis.get('ArtifactTypeNames') ?? true)
      next.rank = !(vis.get('RankLabel') ?? true)
      next.rarity = !(vis.get('RarityNames') ?? true)
      next.faction = !(vis.get('Faction') ?? false)
      setCollapsed(next)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const SectionToggle = ({ id }: { id: keyof typeof collapsed }) => (
    <IconButton size="small" onClick={() => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))} aria-label={collapsed[id] ? 'Expand' : 'Collapse'}>
      {collapsed[id] ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
    </IconButton>
  )
  const anyChip = (fieldLabel: string, value: AnyMode, setValue: (v: AnyMode) => void, tooltip: string) => (
    <Tooltip title={tooltip}>
      <Chip
        size="small"
        variant={value === 'include' ? 'outlined' : 'filled'}
        color={value === 'only' ? 'success' : (value === 'off' ? 'warning' : 'default')}
        label={`Unspecified ${fieldLabel}: ${value === 'include' ? 'Include' : value === 'off' ? 'Hide' : 'Only'}`}
        onClick={() => setValue(value === 'include' ? 'off' : value === 'off' ? 'only' : 'include')}
        sx={{ height: 22 }}
      />
    </Tooltip>
  )

  // Sets — reuse existing Sets select+menu from Builder for familiarity
  const selectedSetTokens: string[] = [
    ...(state.sets.metaSelected ?? []).map((id) => `m:${id}`),
    ...state.sets.selected.map((id) => `s:${Number(id)}`),
  ]
  const setsRenderValue = (tokens: string[]) => {
    const names: string[] = []
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
    const text = (names.length === 0) ? 'Any' : names.join(', ')
    return (
      <EllipsisTooltip title={text} wrap="block">
        <Box component="span" data-ellipsis-target sx={{ display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</Box>
      </EllipsisTooltip>
    )
  }

  const handleSetsChange = (e: SelectChangeEvent<string[]>) => {
    const tokens = e.target.value as string[]
    const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
    const metaIds = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
    onChange({ ...state, sets: { ...state.sets, selected: setIds, metaSelected: metaIds } })
  }

  // Slots — compact toggle buttons with icons/text
  const slotButtons = PREFERRED_ARTIFACT_TYPE_ORDER.map((t) => ({ id: Number(t), name: artifactTypeName(t) }))
  const selectedSlots = new Set(state.slots.selected.map(Number))

  // Rank/Rarity — sliders replaced with concise button rows for milestone ranges to keep UI compact
  const rankValues: Array<1|2|3|4|5|6> = [1,2,3,4,5,6]
  const rarityValues: Array<1|2|3|4|5|6> = [1,2,3,4,5,6]

  // Level buttons
  const levelValues: Array<0|4|8|12|16> = [0,4,8,12,16]

  // Main/Substats — multi-selects using StatVariant labels
  const selectableStats = [
    StatVariant.SPD, StatVariant.CR, StatVariant.CDMG, StatVariant.ACC, StatVariant.RES,
    StatVariant.HP, StatVariant.HP_FLAT, StatVariant.ATK, StatVariant.ATK_FLAT, StatVariant.DEF, StatVariant.DEF_FLAT,
  ]

  return (
    <Box sx={{ border: theme => `1px solid ${theme.palette.divider}`, p: 0.75, borderRadius: 1, mb: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <FilterAltIcon fontSize="small" />
          <Typography variant="subtitle2">Filter rules only filter this view. Export is not affected.</Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" onClick={() => onChange({
            sets: { selected: [], anyMode: 'include' },
            slots: { selected: [], anyMode: 'include' },
            rank: { anyMode: 'include' },
            rarity: { anyMode: 'include' },
            level: { selected: [], anyMode: 'include' },
            main: { selected: [], anyMode: 'include' },
            sub: { selected: [], mode: 'all', wildcardMode: 'include' },
            faction: { selected: [], anyMode: 'include' },
          })}>Reset filters</Button>
          <Button size="small" variant="outlined" startIcon={<CloseIcon fontSize="small" />} onClick={onClose}>Hide</Button>
        </Stack>
      </Stack>
      <Divider sx={{ mb: 1, opacity: 0.5 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 1, rowGap: 0.75 }}>
        {/* Left column */}
        <Box>
          {/* Sets */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="sets" />
              <FormLabel sx={{ m: 0 }}>Sets</FormLabel>
            </Box>
            <Collapse in={!collapsed.sets} timeout="auto" unmountOnExit>
            <Select
              multiple
              size="small"
              value={selectedSetTokens}
              onChange={handleSetsChange}
              renderValue={setsRenderValue}
              data-tour-id="filter.sets"
              displayEmpty
            >
              {/* Metasets section (optional) */}
              {(metasets?.length ?? 0) > 0 && (
                <Box component="li" sx={{ display: 'block', p: 0, m: 0 }}>
                  <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} data-tour-id="menu.metasets.section">
                    <MenuItem disabled sx={{ opacity: 0.7 }}>Metasets</MenuItem>
                    {metasets.map((m) => {
                      const selected = (state.sets.metaSelected ?? []).includes(m.id)
                      return (
                        <MenuItem key={m.id} value={`m:${m.id}`} selected={selected}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                            <Typography noWrap>{m.name}</Typography>
                            {m.sets.length > 0 && (
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{m.sets.map(artifactSetName).join(', ')}</Typography>
                            )}
                          </Box>
                        </MenuItem>
                      )
                    })}
                  </Box>
                </Box>
              )}
              {/* Regular sets via icon grid */}
              <SetMenuSection
                title=""
                sorted={filterAndSortSetEntries('', 'icons')}
                setsOrder="icons"
                metasets={metasets}
                setUsageCounts={{}}
                valueForSet={(id) => `s:${id}`}
                onToggleSet={(id) => {
                  const idNum = Number(id)
                  const prev = new Set(state.sets.selected.map(Number))
                  if (prev.has(idNum)) prev.delete(idNum); else prev.add(idNum)
                  const next = Array.from(prev).sort((a,b)=>a-b)
                  onChange({ ...state, sets: { ...state.sets, selected: next } })
                }}
                hideHeader
                hoveredMetasetId={null}
                selectedMetasetIds={[]}
                selectedSetIds={state.sets.selected.map(Number)}
              />
            </Select>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25, flexWrap: 'wrap' }}>
              {anyChip('Sets', state.sets.anyMode, (v) => onChange({ ...state, sets: { ...state.sets, anyMode: v } }), 'Controls rules that do not specify Sets (treated as Any in HSF)')}
              <Tooltip title={"Combine selected sets: Any of (OR) or All of (AND)"}> 
                <Chip
                  size="small"
                  variant={(state.sets.match ?? 'any') === 'any' ? 'outlined' : 'filled'}
                  color={(state.sets.match ?? 'any') === 'any' ? 'default' : 'info'}
                  label={`Match: ${(state.sets.match ?? 'any') === 'any' ? 'Any of' : 'All of'}`}
                  onClick={() => {
                    const next = (state.sets.match ?? 'any') === 'any' ? 'all' : 'any'
                    onChange({ ...state, sets: { ...state.sets, match: next } })
                  }}
                  sx={{ height: 22 }}
                />
              </Tooltip>
            </Stack>
            </Collapse>
          </FormControl>
          {/* Mainstat (below Sets) */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="main" />
              <FormLabel sx={{ m: 0 }}>Mainstat</FormLabel>
            </Box>
            <Collapse in={!collapsed.main} timeout="auto" unmountOnExit>
            <ToggleButtonGroup
              size="small"
              value={state.main.selected.map(String)}
              onChange={(_, vals: string[]) => {
                const nums = vals.map(v => Number(v) as StatVariant)
                onChange({ ...state, main: { ...state.main, selected: nums } })
              }}
              sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 } }}
            >
              {selectableStats.map(v => (
                <ToggleButton key={v} value={String(v)} aria-label={labelOfVariant(v)}>{labelOfVariant(v)}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Box sx={{ mt: 0.25 }}>{anyChip('Mainstats', state.main.anyMode, (v) => onChange({ ...state, main: { ...state.main, anyMode: v } }), 'Controls rules that do not specify Mainstat (treated as Any in HSF)')}</Box>
            </Collapse>
          </FormControl>

          {/* Substats (below Sets) */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="sub" />
              <FormLabel sx={{ m: 0 }}>Substats</FormLabel>
            </Box>
            <Collapse in={!collapsed.sub} timeout="auto" unmountOnExit>
            <ToggleButtonGroup
              size="small"
              value={state.sub.selected.map(String)}
              onChange={(_, vals: string[]) => {
                const nums = vals.map(v => Number(v) as StatVariant)
                onChange({ ...state, sub: { ...state.sub, selected: nums } })
              }}
              sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 } }}
            >
              {selectableStats.map(v => (
                <ToggleButton key={v} value={String(v)} aria-label={labelOfVariant(v)}>{labelOfVariant(v)}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            {/* Chips row below substats */}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25, flexWrap: 'wrap' }}>
              <Tooltip title={"Combine selected substats: Any of (OR) or All of (AND)"}> 
                <Chip
                  size="small"
                  variant={state.sub.mode === 'any' ? 'outlined' : 'filled'}
                  color={state.sub.mode === 'any' ? 'default' : 'info'}
                  label={`Match: ${state.sub.mode === 'any' ? 'Any of' : 'All of'}`}
                  onClick={() => {
                    const next = state.sub.mode === 'any' ? 'all' : 'any'
                    onChange({ ...state, sub: { ...state.sub, mode: next } })
                  }}
                  sx={{ height: 22 }}
                />
              </Tooltip>
              {anyChip('Substats ★', state.sub.wildcardMode, (v) => onChange({ ...state, sub: { ...state.sub, wildcardMode: v } }), 'Controls rules that use wildcard substats')}
            </Stack>
            </Collapse>
          </FormControl>

          {/* Faction (moved below Substats) */}
          {showFaction && (
            <FormControl fullWidth sx={{ mb: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <SectionToggle id="faction" />
                <FormLabel sx={{ m: 0 }}>Faction</FormLabel>
              </Box>
              <Collapse in={!collapsed.faction} timeout="auto" unmountOnExit>
                <Select
                  multiple
                  size="small"
                  value={state.faction.selected.map(n => String(n))}
                  onChange={(e) => {
                    const vals = (e.target.value as string[]).map(n => Number(n))
                    onChange({ ...state, faction: { ...state.faction, selected: vals } })
                  }}
                  displayEmpty
                  renderValue={(vals) => {
                    const names = (vals as string[]).map(v => factionNames[Number(v)] ?? '').filter(Boolean)
                    const text = names.length ? names.join(', ') : 'Any'
                    return <Typography variant="body2" noWrap>{text}</Typography>
                  }}
                >
                  {Object.entries(factionNames).filter(([k]) => Number(k) !== 0).map(([k, v]) => (
                    <MenuItem key={k} value={k}>{v}</MenuItem>
                  ))}
                </Select>
                <Box sx={{ mt: 0.25 }}>{anyChip('Factions', state.faction.anyMode, (v) => onChange({ ...state, faction: { ...state.faction, anyMode: v } }), 'Controls rules that do not specify Faction (treated as Any in HSF)')}</Box>
              </Collapse>
            </FormControl>
          )}
        </Box>

        {/* Right column */}
        <Box>
          {/* Level */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="level" />
              <FormLabel sx={{ m: 0 }}>Level</FormLabel>
            </Box>
            <Collapse in={!collapsed.level} timeout="auto" unmountOnExit>
            <ToggleButtonGroup size="small" value={state.level.selected.map(String)} onChange={(_, vals: string[]) => {
              const parsed = vals.map(v => Number(v)) as Array<0|4|8|12|16>
              onChange({ ...state, level: { ...state.level, selected: parsed } })
            }} sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 } }}>
              {levelValues.map(v => (<ToggleButton key={v} value={String(v)}>+{v}</ToggleButton>))}
            </ToggleButtonGroup>
            <Box sx={{ mt: 0.25 }}>{anyChip('Levels', state.level.anyMode, (v) => onChange({ ...state, level: { ...state.level, anyMode: v } }), 'Controls rules that use Any level (99 in HSF)')}</Box>
            </Collapse>
          </FormControl>

          {/* Slots */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="slots" />
              <FormLabel sx={{ m: 0 }}>Slots</FormLabel>
            </Box>
            <Collapse in={!collapsed.slots} timeout="auto" unmountOnExit>
            <ToggleButtonGroup
              size="small"
              value={Array.from(selectedSlots).map(String)}
              onChange={(_, vals: string[]) => {
                const ids = vals.map(v => Number(v))
                onChange({ ...state, slots: { ...state.slots, selected: ids } })
              }}
              sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 } }}
            >
              {slotButtons.map(s => {
                const Icon = artifactTypeIconFor(s.id)
                const content = Icon ? <Icon fontSize="inherit" /> : <span style={{ fontSize: 12 }}>{s.name}</span>
                return (
                  <Tooltip key={s.id} title={s.name} placement="bottom" disableInteractive>
                    <ToggleButton value={String(s.id)} aria-label={s.name}>
                      {content}
                    </ToggleButton>
                  </Tooltip>
                )
              })}
            </ToggleButtonGroup>
            <Box sx={{ mt: 0.25 }}>{anyChip('Slots', state.slots.anyMode, (v) => onChange({ ...state, slots: { ...state.slots, anyMode: v } }), 'Controls rules that do not specify Slots (treated as Any in HSF)')}</Box>
            </Collapse>
          </FormControl>

          {/* Rank */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="rank" />
              <FormLabel sx={{ m: 0 }}>Rank</FormLabel>
            </Box>
            <Collapse in={!collapsed.rank} timeout="auto" unmountOnExit>
            <ToggleButtonGroup size="small" value={(() => {
              const vals: number[] = []
              if (state.rank.min !== undefined && state.rank.max !== undefined) {
                for (let v = state.rank.min; v <= state.rank.max; v++) vals.push(v)
              }
              return vals.map(String)
            })()} onChange={(_, vals: string[]) => {
              const nums = vals.map(v => Number(v)).sort((a,b)=>a-b)
              const next: typeof state.rank = { anyMode: state.rank.anyMode }
              if (nums.length) {
                next.min = nums[0] as 1|2|3|4|5|6
                next.max = nums[nums.length - 1] as 1|2|3|4|5|6
              }
              onChange({ ...state, rank: next })
            }} sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 } }}>
              {rankValues.map(v => (<ToggleButton key={v} value={String(v)}>{v}★</ToggleButton>))}
            </ToggleButtonGroup>
            <Box sx={{ mt: 0.25 }}>{anyChip('Rank', state.rank.anyMode, (v) => onChange({ ...state, rank: { ...state.rank, anyMode: v } }), 'Controls rules that do not specify Rank (code 0 = Any)')}</Box>
            </Collapse>
          </FormControl>

          {/* Rarity */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="rarity" />
              <FormLabel sx={{ m: 0 }}>Rarity</FormLabel>
            </Box>
            <Collapse in={!collapsed.rarity} timeout="auto" unmountOnExit>
            <ToggleButtonGroup size="small" value={(() => {
              const vals: number[] = []
              if (state.rarity.min !== undefined && state.rarity.max !== undefined) {
                for (let v = state.rarity.min; v <= state.rarity.max; v++) vals.push(v)
              }
              return vals.map(String)
            })()} onChange={(_, vals: string[]) => {
              const nums = vals.map(v => Number(v)).sort((a,b)=>a-b)
              const next: typeof state.rarity = { anyMode: state.rarity.anyMode }
              if (nums.length) {
                next.min = nums[0] as 1|2|3|4|5|6
                next.max = nums[nums.length - 1] as 1|2|3|4|5|6
              }
              onChange({ ...state, rarity: next })
            }} sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 } }}>
              {rarityValues.map(v => (<ToggleButton key={v} value={String(v)}>{['—','Common','Uncommon','Rare','Epic','Legendary','Mythical'][v]}</ToggleButton>))}
            </ToggleButtonGroup>
            <Box sx={{ mt: 0.25 }}>{anyChip('Rarity', state.rarity.anyMode, (v) => onChange({ ...state, rarity: { ...state.rarity, anyMode: v } }), 'Controls rules that do not specify Rarity (code 0 = Any)')}</Box>
            </Collapse>
          </FormControl>
          {/* Faction moved to left column */}
        </Box>

        {/* Full-width rows */}
        {/* No full-width Main/Sub section: they live under Sets in the left column */}
      </Box>
    </Box>
  )
}
