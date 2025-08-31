import React, { useEffect, useState } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Checkbox, IconButton, MenuItem, Select, Stack, TextField as MuiTextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, Divider } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import EllipsisTooltip from './EllipsisTooltip'
import type { Metaset } from '../lib/metasets'
import { artifactSetName, artifactSetNames } from '../lib/types'
import { defaultMetasets } from '../lib/metasets'

export default function MetasetsDialog({
  open,
  onClose,
  metasets,
  onMetasetsChange,
  onDeleteMetaset,
  includeAllExplicitMeta,
  onIncludeAllExplicitMetaChange,
  setUsageCounts,
  metasetUsageCounts,
  setsSearch,
  onSetsSearchChange,
  setsOrder,
  onSetsOrderChange,
  metaSetsMenuOpen,
  setMetaSetsMenuOpen,
}: {
  open: boolean
  onClose: () => void
  metasets: Metaset[]
  onMetasetsChange: (next: Metaset[]) => void
  onDeleteMetaset: (id: string) => void
  includeAllExplicitMeta: boolean
  onIncludeAllExplicitMetaChange: (v: boolean) => void
  setUsageCounts: Record<number, number>
  metasetUsageCounts: Record<string, number>
  setsSearch: string
  onSetsSearchChange: (v: string) => void
  setsOrder: 'game' | 'az'
  onSetsOrderChange: (v: 'game' | 'az') => void
  metaSetsMenuOpen: boolean
  setMetaSetsMenuOpen: (v: boolean) => void
}) {
  const [confirmResetMetasets, setConfirmResetMetasets] = useState(false)
  const [confirmDeleteMetaId, setConfirmDeleteMetaId] = useState<string | null>(null)
  const [confirmClearMetaId, setConfirmClearMetaId] = useState<string | null>(null)

  const MetasetNameField = React.useMemo(() => {
    return React.memo(function MetasetNameField({ id, name, idx }: { id: string; name: string; idx: number }) {
      const [draft, setDraft] = useState(name)
      useEffect(() => { setDraft(name) }, [name, id])
      return (
        <MuiTextField
          size="small"
          label={`Metaset #${idx + 1}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== name) { const next = metasets.map((x,i) => i===idx ? { ...x, name: draft } : x); onMetasetsChange(next) } }}
          onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
        />
      )
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metasets, onMetasetsChange])

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>Manage Metasets</DialogTitle>
        <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Sticky header: search + order controls, and description */}
          <Box sx={{ position: 'sticky', top: 0, zIndex: 1, px: 3, pt: 2, pb: 1 }}>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mb: 1.25 }}>
              <MuiTextField size="small" label="Search sets" value={setsSearch} onChange={(e) => onSetsSearchChange(e.target.value)} sx={{ width: 260 }} />
              <ToggleButtonGroup size="small" value={setsOrder} exclusive onChange={(_, v) => v && onSetsOrderChange(v)}>
                <ToggleButton value="game">Game</ToggleButton>
                <ToggleButton value="az">A–Z</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Named groups of sets. These appear at the top of the Sets selector.
            </Typography>
            <Divider sx={{ mt: 1 }} />
          </Box>
          {/* Scrollable list only for metasets */}
          <Box sx={{ px: 3, py: 2, overflowY: 'auto', maxHeight: '60vh' }}>
            <Stack spacing={1}>
              {metasets.map((m, idx) => (
                <Box key={m.id} sx={{ display: 'grid', gridTemplateColumns: 'auto 240px minmax(0,1fr) auto auto auto auto', gap: 1, alignItems: 'center' }}>
                  {/* Move up/down controls */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    <Tooltip title="Move up">
                      <span>
                        <IconButton size="small" onClick={() => {
                          if (idx === 0) return
                          const arr = metasets.slice()
                          const tmp = arr[idx-1]!
                          arr[idx-1] = arr[idx]!
                          arr[idx] = tmp
                          onMetasetsChange(arr)
                        }} disabled={idx === 0}>
                          <ArrowUpwardIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <span>
                        <IconButton size="small" onClick={() => {
                          if (idx === metasets.length - 1) return
                          const arr = metasets.slice()
                          const tmp = arr[idx+1]!
                          arr[idx+1] = arr[idx]!
                          arr[idx] = tmp
                          onMetasetsChange(arr)
                        }} disabled={idx === metasets.length - 1}>
                          <ArrowDownwardIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                  <MetasetNameField id={m.id} name={m.name} idx={idx} />
                  <EllipsisTooltip title={m.sets.map(artifactSetName).join(', ')} selector=".MuiSelect-select" disabled={metaSetsMenuOpen} wrap="block">
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
                      renderValue={(selected) => (selected as string[]).map((s) => artifactSetName(Number(s))).join(', ')}
                      onOpen={() => setMetaSetsMenuOpen(true)}
                      onClose={() => setMetaSetsMenuOpen(false)}
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
                          const used = setUsageCounts[Number(id)] || 0
                          const metaNames = metasets
                            .filter(x => x.sets.includes(Number(id)) && x.id !== m.id && x.show !== false)
                            .map(x => x.name)
                          const joined = metaNames.join(', ')
                          return (
                            <MenuItem key={id} value={String(id)}>
                              <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                                  <Typography>{name}</Typography>
                                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>({used} use(s) in configs)</Typography>
                                </Box>
                                {metaNames.length > 0 && (
                                  <Tooltip title={joined}>
                                    <Typography
                                      variant="caption"
                                      sx={{ color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    >
                                      {`in: ${joined}`}
                                    </Typography>
                                  </Tooltip>
                                )}
                              </Box>
                            </MenuItem>
                          )
                        })
                      })()}
                    </Select>
                  </EllipsisTooltip>
                  {/* Visibility toggle */}
                  <Box sx={{ justifySelf: 'end' }}>
                    <Tooltip title={m.show === false ? 'Hidden from menus' : 'Visible in menus'}>
                      <Button
                        size="small"
                        variant={m.show === false ? 'outlined' : 'contained'}
                        color={m.show === false ? 'warning' : 'success'}
                        startIcon={m.show === false ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        sx={{ minWidth: 120 }}
                        onClick={() => {
                          const next = metasets.map((x,i) => i===idx ? { ...x, show: m.show === false ? true : false } : x)
                          onMetasetsChange(next)
                        }}
                      >
                        {m.show === false ? 'Hidden' : 'Shown'}
                      </Button>
                    </Tooltip>
                  </Box>
                  <Button color="warning" onClick={() => setConfirmClearMetaId(m.id)}>Clear</Button>
                  {(() => {
                    const used = metasetUsageCounts[m.id] || 0
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Button color="error" onClick={() => setConfirmDeleteMetaId(m.id)}>Delete</Button>
                        <Chip
                          size="small"
                          label={`${used} use(s)`}
                          color={used > 0 ? 'warning' : 'default'}
                          sx={{ width: 84, justifyContent: 'center' }}
                        />
                      </Box>
                    )
                  })()}
                </Box>
              ))}
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onMetasetsChange(metasets.concat({ id: `meta_${Date.now()}`, name: 'New metaset', sets: [], show: true }))}>Add metaset</Button>
          <FormControlLabel
            control={<Checkbox size="small" checked={includeAllExplicitMeta} onChange={(e) => onIncludeAllExplicitMetaChange(e.target.checked)} />}
            label={
              <Tooltip title={'Adds an &quot;All (Explicit)&quot; metaset that lists all current sets explicitly (unlike &quot;Any&quot;). Useful so new game sets won\'t match old rules.'}>
                <span>Add explicit metaset for &quot;All&quot;</span>
              </Tooltip>
            }
          />
          <Button size="small" variant="outlined" color="error" onClick={() => setConfirmResetMetasets(true)}>Reset to defaults</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>Close</Button>
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
          <Button color="warning" onClick={() => { const id = confirmClearMetaId!; setConfirmClearMetaId(null); const next = metasets.map(m => m.id === id ? { ...m, sets: [] } : m); onMetasetsChange(next) }}>Clear</Button>
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
          <Button color="error" onClick={() => { const id = confirmDeleteMetaId!; setConfirmDeleteMetaId(null); onDeleteMetaset(id) }}>Delete</Button>
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
    </>
  )
}
