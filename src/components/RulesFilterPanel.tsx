import { Box, Button, Chip, Collapse, Divider, FormControl, FormLabel, IconButton, ListSubheader, MenuItem, Select, SelectChangeEvent, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import CloseIcon from '@mui/icons-material/Close'
import SetMenuSection from './SetMenuSection'
import SetsOrderControls from './SetsOrderControls'
import { artifactTypeIconFor } from './artifactTypeIcons'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { artifactSetName, PREFERRED_ARTIFACT_TYPE_ORDER, StatVariant, labelOfVariant, factionNames, Faction, filterAndSortSetEntries, statVariantI18nKey, artifactSetI18nKey } from '../lib/types'
import { LIST_SUBHEADER_SX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, MENU_MAX_HEIGHT_METASETS_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_SCROLL_GUTTER_PX, SETS_MENU_WIDTH_PX, SETS_ORDER_KEY, FILTER_FACTION_SELECT_WIDTH_PX, FILTER_SETS_SELECT_WIDTH_PX, FILTER_CHIP_TOP_MARGIN, FILTER_CHIP_OPACITY, ELLIPSIS_TEXT_SX, FILTER_TOGGLE_BUTTON_WIDTH_PX } from '../lib/constants'
import type { Metaset } from '../lib/metasets'
import React from 'react'
import type { AnyMode, RulesFilterState, Bool3 } from '../lib/rulesFilter'

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
  const { t } = useI18n()
  // Persisted Sets order + local search to mirror Builder UX
  const [setsOrder, setSetsOrder] = React.useState<'game' | 'az' | 'icons'>(() => {
    try {
      const raw = localStorage.getItem(SETS_ORDER_KEY)
      if (raw === 'game' || raw === 'az' || raw === 'icons') return raw
    } catch {}
    return 'icons'
  })
  const [setsSearch, setSetsSearch] = React.useState('')
  React.useEffect(() => {
    try { localStorage.setItem(SETS_ORDER_KEY, setsOrder) } catch {}
  }, [setsOrder])
  // Collapsible sections: persisted; initialized from rules table column visibility on first open this session
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('sellfileCreator.rulesFilter.collapse.v1')
      if (raw) return JSON.parse(raw) as Record<string, boolean>
    } catch {}
    // Default expanded sections; add 'rule' with default expanded (false = not collapsed)
    return { rule: false, sets: false, main: false, sub: false, level: false, slots: false, rank: false, rarity: false, faction: false }
  })
  React.useEffect(() => {
    try { localStorage.setItem('sellfileCreator.rulesFilter.collapse.v1', JSON.stringify(collapsed)) } catch {}
  }, [collapsed])
  // Per-section condensed toggles (persisted)
  // Rank/Rarity are always condensed now (More/Less removed)
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
      // Rule: not tied to a table column; keep as-is (defaults to expanded)
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
  // Why: A single helper for the compact filter chips that control how to treat
  // rules with "Any" in a field (or wildcard for substats). Keeps wording
  // consistent across fields and makes the intent explicit to users.
  const anyChip = (fieldLabel: string, value: AnyMode, setValue: (v: AnyMode) => void, tooltip: string) => (
    <Tooltip title={tooltip}>
      <Chip
        size="small"
        variant="filled"
        color={value === 'include' ? 'success' : (value === 'off' ? 'warning' : 'info')}
        label={`'${t('any')}' ${fieldLabel}: ${value === 'include' ? t('filterShow') : value === 'off' ? t('filterHide') : t('filterOnly')}`}
        onClick={() => setValue(value === 'include' ? 'off' : value === 'off' ? 'only' : 'include')}
        sx={{ height: 22, opacity: FILTER_CHIP_OPACITY }}
      />
    </Tooltip>
  )

  // Sets — reuse Builder look/feel: tokens, renderValue, order/search
  // Track menu paper for height measurement and anchor position to avoid
  // misplacement near viewport edges (mirror Builder behavior).
  const setsMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
  const [setsMenuAnchorPos, setSetsMenuAnchorPos] = React.useState<{ top: number; left: number } | null>(null)
  // While the Sets select menu is open, track which metaset the user is hovering
  // to temporarily highlight member gear sets in the Sets section below.
  const [hoveredSetMetaId, setHoveredSetMetaId] = React.useState<string | null>(null)
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
    const text = (names.length === 0) ? t('any') : names.join(', ')
    return (
      <Box
        component="span"
        data-ellipsis-target
        title={text}
        sx={{ display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {text}
      </Box>
    )
  }

  const handleSetsChange = (e: SelectChangeEvent<string[]>) => {
    const tokens = e.target.value as string[]
    const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
    const metaIds = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
    onChange({ ...state, sets: { ...state.sets, selected: setIds, metaSelected: metaIds } })
  }

  // Slots — compact toggle buttons with icons/text
  const slotButtons = PREFERRED_ARTIFACT_TYPE_ORDER.map((tt) => ({ id: Number(tt), name: ((): string => {
    switch (Number(tt)) {
      case 5: return t('slotWeapon')
      case 1: return t('slotHelmet')
      case 6: return t('slotShield')
      case 3: return t('slotGauntlets')
      case 2: return t('slotChestplate')
      case 4: return t('slotBoots')
      case 7: return t('slotRing')
      case 8: return t('slotAmulet')
      case 9: return t('slotBanner')
      default: return String(tt)
    }
  })() }))
  const selectedSlots = new Set(state.slots.selected.map(Number))

  // Rank/Rarity — sliders replaced with concise button rows for milestone ranges to keep UI compact
  // Rank/Rarity value constants not needed in condensed mode

  // Level buttons
  const levelValues: Array<0|4|8|12|16> = [0,4,8,12,16]

  // Main/Substats — multi-selects using StatVariant labels
  const selectableStats = [
    StatVariant.SPD, StatVariant.CR, StatVariant.CDMG, StatVariant.ACC, StatVariant.RES,
    StatVariant.HP, StatVariant.HP_FLAT, StatVariant.ATK, StatVariant.ATK_FLAT, StatVariant.DEF, StatVariant.DEF_FLAT,
  ]

  // Helpers for condensed Rank/Rarity selections
  const rankSelected = new Set((state.rank.selected ?? []).map(Number))
  const raritySelected = new Set((state.rarity.selected ?? []).map(Number))
  const groupRank13On = rankSelected.has(1) && rankSelected.has(2) && rankSelected.has(3)
  const groupRarityCUOn = raritySelected.has(1) && raritySelected.has(2)
  // Group toggles handled inline in onChange for Rank/Rarity condensed controls

  return (
    <Box sx={{ border: theme => `1px solid ${theme.palette.divider}`, p: 0.75, borderRadius: 1, mb: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <FilterAltIcon fontSize="small" />
          <Typography variant="subtitle2">{t('filterHeader')}</Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" onClick={() => onChange({
            rule: { keep: 'any', use: 'any' },
            sets: { selected: [], metaSelected: [], anyMode: 'include' },
            slots: { selected: [], anyMode: 'include' },
            rank: { selected: [], anyMode: 'include' },
            rarity: { selected: [], anyMode: 'include' },
            level: { selected: [], anyMode: 'include' },
            main: { selected: [], anyMode: 'include' },
            sub: { selected: [], mode: 'all', wildcardMode: 'include' },
            faction: { selected: [], anyMode: 'include' },
          })}>{t('filterReset')}</Button>
          <Button size="small" variant="outlined" startIcon={<CloseIcon fontSize="small" />} onClick={onClose}>{t('close')}</Button>
        </Stack>
      </Stack>
      <Divider sx={{ mb: 1, opacity: 0.5 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 1, rowGap: 0.75 }}>
        {/* Left column */}
        <Box>
          {/* Top row: Rule (left) and Sets (right) inside a nested grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' }, columnGap: 1, rowGap: 0.75 }}>
          {/* Rule: Action (Keep/Sell) with Status below (On/Off) */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="rule" />
              <FormLabel sx={{ m: 0 }}>{t('filterRule')}</FormLabel>
            </Box>
            <Collapse in={!collapsed.rule} timeout="auto" unmountOnExit>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <ToggleButtonGroup
                  size="small"
                  value={state.rule?.keep ?? 'any'}
                  exclusive
                  onChange={(_, v: Bool3 | null) => {
                    if (!v) return
                    onChange({ ...state, rule: { keep: v, use: state.rule?.use ?? 'any' } })
                  }}
                  sx={{
                    '& .MuiToggleButton-root': {
                      p: 0.5,
                      width: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                      minWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                      maxWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                      height: 28,
                      overflow: 'hidden',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': { marginLeft: '0 !important', borderLeft: '1px solid transparent' },
                    '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': { marginLeft: '0 !important', borderLeft: '1px solid transparent' },
                  }}
                >
                  <ToggleButton value={'yes'} title={t('keepValueKeep')}>
                    <Typography component="span" noWrap sx={[ELLIPSIS_TEXT_SX, { width: '100%', textAlign: 'center' }]}>
                      {t('keepValueKeep')}
                    </Typography>
                  </ToggleButton>
                  <ToggleButton value={'no'} title={t('keepValueSell')}>
                    <Typography component="span" noWrap sx={[ELLIPSIS_TEXT_SX, { width: '100%', textAlign: 'center' }]}>
                      {t('keepValueSell')}
                    </Typography>
                  </ToggleButton>
                  <ToggleButton value={'any'} title={t('any')}>
                    <Typography component="span" noWrap sx={[ELLIPSIS_TEXT_SX, { width: '100%', textAlign: 'center' }]}>
                      {t('any')}
                    </Typography>
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <ToggleButtonGroup
                  size="small"
                  value={state.rule?.use ?? 'any'}
                  exclusive
                  onChange={(_, v: Bool3 | null) => {
                    if (!v) return
                    onChange({ ...state, rule: { keep: state.rule?.keep ?? 'any', use: v } })
                  }}
                  sx={{
                    '& .MuiToggleButton-root': {
                      p: 0.5,
                      width: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                      minWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                      maxWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                      height: 28,
                      overflow: 'hidden',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': { marginLeft: '0 !important', borderLeft: '1px solid transparent' },
                    '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': { marginLeft: '0 !important', borderLeft: '1px solid transparent' },
                  }}
                >
                  <ToggleButton value={'yes'} title={t('enabled')}>
                    <Typography component="span" noWrap sx={[ELLIPSIS_TEXT_SX, { width: '100%', textAlign: 'center' }]}>
                      {t('enabled')}
                    </Typography>
                  </ToggleButton>
                  <ToggleButton value={'no'} title={t('disabled')}>
                    <Typography component="span" noWrap sx={[ELLIPSIS_TEXT_SX, { width: '100%', textAlign: 'center' }]}>
                      {t('disabled')}
                    </Typography>
                  </ToggleButton>
                  <ToggleButton value={'any'} title={t('any')}>
                    <Typography component="span" noWrap sx={[ELLIPSIS_TEXT_SX, { width: '100%', textAlign: 'center' }]}>
                      {t('any')}
                    </Typography>
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>
            </Collapse>
          </FormControl>
          {/* Sets (compact, fixed width on sm+) */}
          <FormControl fullWidth sx={{ mb: 0.75, width: { xs: '100%', sm: FILTER_SETS_SELECT_WIDTH_PX }, maxWidth: FILTER_SETS_SELECT_WIDTH_PX }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="sets" />
              <FormLabel sx={{ m: 0 }}>{t('filterSets')}</FormLabel>
            </Box>
            <Collapse in={!collapsed.sets} timeout="auto" unmountOnExit>
            {(() => {
              const sorted = filterAndSortSetEntries(setsSearch, setsOrder)
              const metasetsMenu = metasets.filter(m => m.show !== false)
              return (
                <Select
                  multiple
                  size="small"
                  value={selectedSetTokens}
                  onChange={handleSetsChange}
                  renderValue={setsRenderValue}
                  data-tour-id="filter.sets"
                  displayEmpty
                  onOpen={(e) => {
                    try {
                      const el = (e?.currentTarget as HTMLElement | null)
                      const rect = el?.getBoundingClientRect()
                      const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
                      const margin = 8
                      const theoreticalMax = (metasetsMenu.length > 0)
                        ? (MENU_MAX_HEIGHT_METASETS_PX + MENU_MAX_HEIGHT_SETS_LIST_PX)
                        : (MENU_MAX_HEIGHT_SETS_LIST_PX)
                      const desiredTop = rect ? Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - theoreticalMax - margin)) : margin
                      const desiredLeft = rect ? Math.floor(rect.left) : margin
                      setSetsMenuAnchorPos({ top: desiredTop, left: desiredLeft })
                      const refine = () => {
                        try {
                          const paper = setsMenuPaperRef.current
                          const measured = paper ? Math.ceil(paper.offsetHeight) : 0
                          if (rect && measured > 0) {
                            const maxHeight = Math.min(measured, viewportH - margin * 2)
                            const top = Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - maxHeight - margin))
                            setSetsMenuAnchorPos({ top, left: desiredLeft })
                          }
                        } catch {}
                      }
                      requestAnimationFrame(() => requestAnimationFrame(refine))
                    } catch { setSetsMenuAnchorPos(null) }
                  }}
                  onClose={() => { setSetsMenuAnchorPos(null); setHoveredSetMetaId(null) }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX },
                        maxWidth: SETS_MENU_WIDTH_PX,
                        overflowX: 'hidden',
                      },
                      ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el }
                    },
                    MenuListProps: { sx: { width: '100%', maxWidth: '100%' } },
                    ...(setsMenuAnchorPos
                      ? { anchorReference: 'anchorPosition' as const, anchorPosition: setsMenuAnchorPos, transformOrigin: { vertical: 'top', horizontal: 'left' as const } }
                      : { transformOrigin: { vertical: 'top', horizontal: 'left' as const } }),
                  }}
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
                >
                  {(metasetsMenu.length > 0) && (
                    <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                      <Box
                        component="ul"
                        sx={{
                          listStyle: 'none', p: 0, m: 0,
                          maxHeight: MENU_MAX_HEIGHT_METASETS_PX,
                          overflowY: 'auto',
                          pr: `${MENU_SCROLL_GUTTER_PX}px`,
                          scrollbarGutter: 'stable both-edges',
                        }}
                        data-tour-id="menu.metasets.section"
                      >
                        <ListSubheader sx={LIST_SUBHEADER_SX}>{t('menuMetasetsSection')}</ListSubheader>
                        {metasetsMenu.map((m) => {
                          const selected = (state.sets.metaSelected ?? []).includes(m.id)
                          const setNames = m.sets.map(id => t(artifactSetI18nKey(id))).filter(Boolean)
                          const joined = setNames.join(', ')
                          return (
                            <MenuItem
                              key={m.id}
                              value={`m:${m.id}`}
                              selected={selected}
                              onMouseEnter={() => setHoveredSetMetaId(m.id)}
                              onMouseLeave={() => setHoveredSetMetaId(prev => prev === m.id ? null : prev)}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const token = `m:${m.id}`
                                const tokensSet = new Set<string>(selectedSetTokens)
                                if (tokensSet.has(token)) tokensSet.delete(token); else tokensSet.add(token)
                                const tokens = Array.from(tokensSet)
                                const metaIds = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
                                const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
                                onChange({ ...state, sets: { ...state.sets, metaSelected: metaIds, selected: setIds } })
                              }}
                            >
                              <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                                {/* Clamp metaset names so verbose translations don't push the menu wider. */}
                                <Typography
                                  data-ellipsis-target
                                  title={m.name}
                                  sx={[ELLIPSIS_TEXT_SX, { display: 'block', width: '100%' }]}
                                >
                                  {m.name}
                                </Typography>
                                {setNames.length > 0 && (
                                  <Typography
                                    variant="caption"
                                    title={joined}
                                    sx={{ color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }}
                                  >
                                    {joined}
                                  </Typography>
                                )}
                              </Box>
                            </MenuItem>
                          )
                        })}
                      </Box>
                    </Box>
                  )}
                  <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                    <ListSubheader component="div" sx={[LIST_SUBHEADER_SX, { py: 0.5, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, boxSizing: 'border-box', width: `calc(100% - ${MENU_SCROLL_GUTTER_PX}px)` }]}>
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
                        listStyle: 'none', p: 0, m: 0,
                        ...(setsOrder === 'icons'
                          ? { maxHeight: 'none', height: 'auto', overflowY: 'visible' }
                          : { maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX, height: MENU_MAX_HEIGHT_SETS_LIST_PX, overflowY: 'auto' }),
                        pr: `${MENU_SCROLL_GUTTER_PX}px`,
                        scrollbarGutter: 'stable both-edges' as const,
                      }}
                    >
                      <SetMenuSection
                        title="Sets"
                        sorted={sorted}
                        setsOrder={setsOrder}
                        metasets={metasets}
                        setUsageCounts={{}}
                        showUsageCounts={false}
                        valueForSet={(id) => `s:${id}`}
                        onToggleSet={(id) => {
                          const idNum = Number(id)
                          const prev = new Set(state.sets.selected.map(Number))
                          if (prev.has(idNum)) prev.delete(idNum); else prev.add(idNum)
                          const next = Array.from(prev).sort((a,b)=>a-b)
                          onChange({ ...state, sets: { ...state.sets, selected: next } })
                        }}
                        hideHeader
                        hoveredMetasetId={hoveredSetMetaId}
                        selectedMetasetIds={state.sets.metaSelected ?? []}
                        selectedSetIds={state.sets.selected.map(Number)}
                      />
                    </Box>
                  </Box>
                </Select>
              )
            })()}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: FILTER_CHIP_TOP_MARGIN, flexWrap: 'wrap' }}>
              {anyChip(t('filterSets'), state.sets.anyMode, (v) => onChange({ ...state, sets: { ...state.sets, anyMode: v } }), t('filterAnyTooltip', { field: t('filterSets') }))}
              <Tooltip title={t('filterMatchTooltipSets')}> 
                <Chip
                  size="small"
                  variant={'filled'}
                  color={(state.sets.match ?? 'any') === 'any' ? 'success' : 'info'}
                  label={`${t('filterMatch')}: ${(state.sets.match ?? 'any') === 'any' ? t('filterAnyOf') : t('filterAllOf')}`}
                  onClick={() => {
                    const next = (state.sets.match ?? 'any') === 'any' ? 'all' : 'any'
                    onChange({ ...state, sets: { ...state.sets, match: next } })
                  }}
                  sx={{ height: 22, opacity: FILTER_CHIP_OPACITY }}
                />
              </Tooltip>
            </Stack>
            </Collapse>
          </FormControl>
          </Box>
          {/* Mainstat (below Sets) */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="main" />
              <FormLabel sx={{ m: 0 }}>{t('filterMainstat')}</FormLabel>
            </Box>
            <Collapse in={!collapsed.main} timeout="auto" unmountOnExit>
            <ToggleButtonGroup
              size="small"
              value={state.main.selected.map(String)}
              onChange={(_, vals: string[]) => {
                const nums = vals.map(v => Number(v) as StatVariant)
                onChange({ ...state, main: { ...state.main, selected: nums } })
              }}
              sx={{
                flexWrap: 'wrap',
                '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 },
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
              {selectableStats.map(v => (
                <ToggleButton key={v} value={String(v)} aria-label={labelOfVariant(v)}>{t(statVariantI18nKey(v))}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>{anyChip(t('filterMainstat'), state.main.anyMode, (v) => onChange({ ...state, main: { ...state.main, anyMode: v } }), t('filterAnyTooltip', { field: t('filterMainstat') }))}</Box>
            </Collapse>
          </FormControl>

          {/* Substats (below Sets) */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="sub" />
              <FormLabel sx={{ m: 0 }}>{t('filterSubstats')}</FormLabel>
            </Box>
            <Collapse in={!collapsed.sub} timeout="auto" unmountOnExit>
            <ToggleButtonGroup
              size="small"
              value={state.sub.selected.map(String)}
              onChange={(_, vals: string[]) => {
                const nums = vals.map(v => Number(v) as StatVariant)
                onChange({ ...state, sub: { ...state.sub, selected: nums } })
              }}
              sx={{
                flexWrap: 'wrap',
                '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 },
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
              {selectableStats.map(v => (
                <ToggleButton key={v} value={String(v)} aria-label={labelOfVariant(v)}>{t(statVariantI18nKey(v))}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            {/* Chips row below substats */}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: FILTER_CHIP_TOP_MARGIN, flexWrap: 'wrap' }}>
              <Tooltip title={t('filterMatchTooltipSubstats')}> 
                <Chip
                  size="small"
                  variant={'filled'}
                  color={state.sub.mode === 'any' ? 'success' : 'info'}
                  label={`${t('filterMatch')}: ${state.sub.mode === 'any' ? t('filterAnyOf') : t('filterAllOf')}`}
                  onClick={() => {
                    const next = state.sub.mode === 'any' ? 'all' : 'any'
                    onChange({ ...state, sub: { ...state.sub, mode: next } })
                  }}
                  sx={{ height: 22, opacity: FILTER_CHIP_OPACITY }}
                />
              </Tooltip>
              {/* Wildcard filter chip removed per UX simplification: wildcard rows are treated like normal rows in the preview filters. */}
            </Stack>
            </Collapse>
          </FormControl>

          {/* Faction moved to right column next to Level */}
        </Box>

        {/* Right column */}
        <Box>
          {/* Level + Faction row */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: showFaction ? 'auto 1fr' : '1fr' }, columnGap: 1, rowGap: 1 }}>
            {/* Level */}
            <FormControl fullWidth sx={{ mb: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <SectionToggle id="level" />
                <FormLabel sx={{ m: 0 }}>{t('filterLevel')}</FormLabel>
              </Box>
              <Collapse in={!collapsed.level} timeout="auto" unmountOnExit>
                <ToggleButtonGroup size="small" value={state.level.selected.map(String)} onChange={(_, vals: string[]) => {
                  const parsed = vals.map(v => Number(v)) as Array<0|4|8|12|16>
                  onChange({ ...state, level: { ...state.level, selected: parsed } })
                }} sx={{
                  flexWrap: 'wrap',
                  '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 },
                  '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                    marginLeft: '0 !important',
                    borderLeft: '1px solid transparent',
                  },
                  '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': {
                    marginLeft: '0 !important',
                    borderLeft: '1px solid transparent',
                  },
                }}>
                  {levelValues.map(v => (<ToggleButton key={v} value={String(v)}>+{v}</ToggleButton>))}
                </ToggleButtonGroup>
                <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>{anyChip(t('filterLevel'), state.level.anyMode, (v) => onChange({ ...state, level: { ...state.level, anyMode: v } }), t('filterAnyTooltip', { field: t('filterLevel') }))}</Box>
              </Collapse>
            </FormControl>

            {/* Faction */}
            {showFaction && (
              <FormControl fullWidth sx={{ mb: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <SectionToggle id="faction" />
                  <FormLabel sx={{ m: 0 }}>{t('filterFaction')}</FormLabel>
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
                      const text = names.length ? names.join(', ') : t('any')
                      return (
                        // Keep the selected faction list readable even when translations are long.
                        <Typography
                          variant="body2"
                          data-ellipsis-target
                          title={text}
                          sx={[ELLIPSIS_TEXT_SX, { display: 'block', width: '100%' }]}
                        >
                          {text}
                        </Typography>
                      )
                    }}
                    MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
                    sx={{
                      width: { xs: '100%', sm: FILTER_FACTION_SELECT_WIDTH_PX },
                      maxWidth: FILTER_FACTION_SELECT_WIDTH_PX,
                      '& .MuiSelect-select': {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                        maxWidth: '100%'
                      },
                    }}
                  >
                    <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupTelerianLeague')}</ListSubheader>
                    {[Faction.BannerLords, Faction.HighElves, Faction.SacredOrder, Faction.Barbarians].map((code) => (
                      <MenuItem key={code} value={String(code)}>{
                        code === Faction.BannerLords ? t('factionBannerLords') :
                        code === Faction.HighElves ? t('factionHighElves') :
                        code === Faction.SacredOrder ? t('factionSacredOrder') :
                        code === Faction.Barbarians ? t('factionBarbarians') : String(code)
                      }</MenuItem>
                    ))}
                    <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupGaellenPact')}</ListSubheader>
                    {[Faction.OgrynTribes, Faction.Lizardmen, Faction.Skinwalkers, Faction.Orcs].map((code) => (
                      <MenuItem key={code} value={String(code)}>{
                        code === Faction.OgrynTribes ? t('factionOgrynTribes') :
                        code === Faction.Lizardmen ? t('factionLizardmen') :
                        code === Faction.Skinwalkers ? t('factionSkinwalkers') :
                        code === Faction.Orcs ? t('factionOrcs') : String(code)
                      }</MenuItem>
                    ))}
                    <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupTheCorrupted')}</ListSubheader>
                    {[Faction.Demonspawn, Faction.UndeadHordes, Faction.DarkElves, Faction.KnightRevenant].map((code) => (
                      <MenuItem key={code} value={String(code)}>{
                        code === Faction.Demonspawn ? t('factionDemonspawn') :
                        code === Faction.UndeadHordes ? t('factionUndeadHordes') :
                        code === Faction.DarkElves ? t('factionDarkElves') :
                        code === Faction.KnightRevenant ? t('factionKnightRevenant') : String(code)
                      }</MenuItem>
                    ))}
                    <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupNyresanUnion')}</ListSubheader>
                    {[Faction.Dwarves, Faction.Shadowkin, Faction.SylvanWatchers].map((code) => (
                      <MenuItem key={code} value={String(code)}>{
                        code === Faction.Dwarves ? t('factionDwarves') :
                        code === Faction.Shadowkin ? t('factionShadowkin') :
                        code === Faction.SylvanWatchers ? t('factionSylvanWatchers') : String(code)
                      }</MenuItem>
                    ))}
                  </Select>
                  <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>{anyChip(t('filterFaction'), state.faction.anyMode, (v) => onChange({ ...state, faction: { ...state.faction, anyMode: v } }), t('filterAnyTooltip', { field: t('filterFaction') }))}</Box>
                </Collapse>
              </FormControl>
            )}
          </Box>

          {/* Slots */}
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SectionToggle id="slots" />
              <FormLabel sx={{ m: 0 }}>{t('filterSlots')}</FormLabel>
            </Box>
            <Collapse in={!collapsed.slots} timeout="auto" unmountOnExit>
            <ToggleButtonGroup
              size="small"
              value={Array.from(selectedSlots).map(String)}
              onChange={(_, vals: string[]) => {
                const ids = vals.map(v => Number(v))
                onChange({ ...state, slots: { ...state.slots, selected: ids } })
              }}
              sx={{
                flexWrap: 'wrap',
                '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 },
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
            <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>{anyChip(t('filterSlots'), state.slots.anyMode, (v) => onChange({ ...state, slots: { ...state.slots, anyMode: v } }), t('filterAnyTooltip', { field: t('filterSlots') }))}</Box>
            </Collapse>
          </FormControl>

          {/* Rank + Rarity row (side by side on sm+) */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' }, columnGap: 1, rowGap: 1 }}>
            {/* Rank */}
            <FormControl sx={{ mb: 0.75, width: { xs: '100%', sm: 'auto' } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <SectionToggle id="rank" />
                <FormLabel sx={{ m: 0, mr: 'auto' }}>{t('filterRank')}</FormLabel>
              </Box>
              <Collapse in={!collapsed.rank} timeout="auto" unmountOnExit>
                <ToggleButtonGroup
                  size="small"
                  value={[groupRank13On ? '1-3' : null, rankSelected.has(4) ? '4' : null, rankSelected.has(5) ? '5' : null, rankSelected.has(6) ? '6' : null].filter(Boolean)}
                  onChange={(_, vals: string[]) => {
                    const wantGroup = vals.includes('1-3')
                    const desiredSingles = new Set(vals.filter(v => v !== '1-3').map(v => Number(v)))
                    const next = new Set<number>(state.rank.selected ?? [])
                    // Apply singles (4,5,6)
                    ;[4,5,6].forEach(k => { if (desiredSingles.has(k)) next.add(k); else next.delete(k) })
                    // Apply group (1,2,3)
                    if (wantGroup) { next.add(1); next.add(2); next.add(3) } else { next.delete(1); next.delete(2); next.delete(3) }
                    onChange({ ...state, rank: { ...state.rank, selected: Array.from(next).sort((a,b)=>a-b) as Array<1|2|3|4|5|6> } })
                  }}
                  sx={{
                    flexWrap: 'wrap',
                    '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 },
                    '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': { marginLeft: '0 !important', borderLeft: '1px solid transparent' },
                    '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': { marginLeft: '0 !important', borderLeft: '1px solid transparent' },
                  }}
                >
                  <Tooltip title={t('filterSelectRank13')}>
                    <ToggleButton
                      value={'1-3'}
                      aria-label="1 to 3"
                      onClick={(e) => {
                        // Ensure group toggle always applies even if ToggleButtonGroup onChange misfires
                        e.preventDefault(); e.stopPropagation()
                        const next = new Set<number>(state.rank.selected ?? [])
                        const want = !groupRank13On
                        if (want) { next.add(1); next.add(2); next.add(3) } else { next.delete(1); next.delete(2); next.delete(3) }
                        onChange({ ...state, rank: { ...state.rank, selected: Array.from(next).sort((a,b)=>a-b) as Array<1|2|3|4|5|6> } })
                      }}
                    >
                      {`${t('star1')}-${t('star3')}`}
                    </ToggleButton>
                  </Tooltip>
                  <ToggleButton value={'4'}>{t('star4')}</ToggleButton>
                  <ToggleButton value={'5'}>{t('star5')}</ToggleButton>
                  <ToggleButton value={'6'}>{t('star6')}</ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>{anyChip(t('filterRank'), state.rank.anyMode, (v) => onChange({ ...state, rank: { ...state.rank, anyMode: v } }), t('filterAnyTooltip', { field: t('filterRank') }))}</Box>
              </Collapse>
            </FormControl>

            {/* Rarity */}
            <FormControl fullWidth sx={{ mb: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <SectionToggle id="rarity" />
                <FormLabel sx={{ m: 0, mr: 'auto' }}>{t('filterRarity')}</FormLabel>
              </Box>
              <Collapse in={!collapsed.rarity} timeout="auto" unmountOnExit>
                <ToggleButtonGroup
                  size="small"
                  value={[groupRarityCUOn ? 'cu' : null, raritySelected.has(3) ? '3' : null, raritySelected.has(4) ? '4' : null, raritySelected.has(5) ? '5' : null, raritySelected.has(6) ? '6' : null].filter(Boolean)}
                  onChange={(_, vals: string[]) => {
                    const wantCU = vals.includes('cu')
                    const singles = new Set(vals.filter(v => v !== 'cu').map(v => Number(v)))
                    const next = new Set<number>(state.rarity.selected ?? [])
                    // Apply singles (Rare..Mythical = 3..6)
                    ;[3,4,5,6].forEach(k => { if (singles.has(k)) next.add(k); else next.delete(k) })
                    // Apply group (Common/Uncommon = 1,2)
                    if (wantCU) { next.add(1); next.add(2) } else { next.delete(1); next.delete(2) }
                    onChange({ ...state, rarity: { ...state.rarity, selected: Array.from(next).sort((a,b)=>a-b) as Array<1|2|3|4|5|6> } })
                  }}
                  sx={{
                    flexWrap: 'wrap',
                    '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 },
                    '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': { marginLeft: '0 !important', borderLeft: '1px solid transparent' },
                    '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': { marginLeft: '0 !important', borderLeft: '1px solid transparent' },
                  }}
                >
                  <Tooltip title={t('filterSelectRarityCU')}>
                    <ToggleButton
                      value={'cu'}
                      aria-label={t('ariaCommonOrUncommon')}
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        const next = new Set<number>(state.rarity.selected ?? [])
                        const want = !groupRarityCUOn
                        if (want) { next.add(1); next.add(2) } else { next.delete(1); next.delete(2) }
                        onChange({ ...state, rarity: { ...state.rarity, selected: Array.from(next).sort((a,b)=>a-b) as Array<1|2|3|4|5|6> } })
                      }}
                    >
                      {t('rarityCUShort')}
                    </ToggleButton>
                  </Tooltip>
                  <ToggleButton value={'3'}>{t('rarityRare')}</ToggleButton>
                  <ToggleButton value={'4'}>{t('rarityEpic')}</ToggleButton>
                  <ToggleButton value={'5'}>{t('rarityLegendary')}</ToggleButton>
                  <ToggleButton value={'6'}>{t('rarityMythical')}</ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>{anyChip(t('filterRarity'), state.rarity.anyMode, (v) => onChange({ ...state, rarity: { ...state.rarity, anyMode: v } }), t('filterAnyTooltip', { field: t('filterRarity') }))}</Box>
              </Collapse>
            </FormControl>
          </Box>
          {/* Faction moved to left column */}
        </Box>

        {/* Full-width rows */}
        {/* No full-width Main/Sub section: they live under Sets in the left column */}
      </Box>
    </Box>
  )
}
