import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Checkbox, IconButton, MenuItem, Select, Stack, TextField as MuiTextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, Divider, Radio, RadioGroup } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import EllipsisTooltip from './EllipsisTooltip'
import type { Metaset } from '../lib/metasets'
import { artifactSetName, artifactSetNames } from '../lib/types'
import { defaultMetasets } from '../lib/metasets'
import { generateMetasetNameWithFlag } from '../lib/namegen'
import { keyframes } from '@emotion/react'

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
  onDeleteMetaset: (id: string, opts?: { replaceWithSets?: boolean; replaceWithMetaId?: string }) => void
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
  const [resetMode, setResetMode] = useState<'delete' | 'replaceSets' | 'replaceMeta'>('delete')
  const [resetReplaceMetaId, setResetReplaceMetaId] = useState<string>('')
  const [confirmDeleteMetaId, setConfirmDeleteMetaId] = useState<string | null>(null)
  const [confirmClearMetaId, setConfirmClearMetaId] = useState<string | null>(null)
  const [deleteReplaceMetaId, setDeleteReplaceMetaId] = useState<string | ''>('')
  const [deleteMode, setDeleteMode] = useState<'delete' | 'replaceSets' | 'replaceMeta'>('delete')
  const [confirmBtnWidth, setConfirmBtnWidth] = useState<number>(320)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [pendingScrollMetaId, setPendingScrollMetaId] = useState<string>('')
  // Ephemeral celebration for playful metaset names: highlight the new row's Select
  const [legendaryMetaId, setLegendaryMetaId] = useState<string>('')

  // Short golden glow effect reminiscent of a legendary pull. Intentionally subtle.
  const legendaryGlow = keyframes`
    0% { box-shadow: 0 0 0px 0 rgba(255, 204, 0, 0), inset 0 0 0px 0 rgba(255, 230, 150, 0); }
    25% { box-shadow: 0 0 14px 3px rgba(255, 204, 0, 0.55), inset 0 0 8px 2px rgba(255, 230, 150, 0.45); }
    60% { box-shadow: 0 0 18px 6px rgba(255, 184, 0, 0.50), inset 0 0 12px 3px rgba(255, 224, 140, 0.45); }
    100% { box-shadow: 0 0 0px 0 rgba(255, 204, 0, 0), inset 0 0 0px 0 rgba(255, 230, 150, 0); }
  `
  const sparkleRise = keyframes`
    0% { transform: translateY(6px) scale(0.9); opacity: 0; }
    20% { opacity: 1; }
    80% { opacity: 0.85; }
    100% { transform: translateY(-10px) scale(1.05); opacity: 0; }
  `

  // Measure the widest possible confirm button label and lock the button width
  useEffect(() => {
    if (!confirmDeleteMetaId) return
    const raf = window.requestAnimationFrame(() => {
      try {
        const root = measureRef.current
        if (!root) return
        let max = 0
        const btns = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]
        for (const b of btns) { max = Math.max(max, b.clientWidth) }
        if (max > 0) setConfirmBtnWidth(max)
      } catch {}
    })
    return () => { try { window.cancelAnimationFrame(raf) } catch {} }
  }, [confirmDeleteMetaId])

  // When a metaset is added, scroll it into view to reduce friction
  useEffect(() => {
    if (!pendingScrollMetaId) return
    const raf = window.requestAnimationFrame(() => {
      try {
        const root = listRef.current
        if (!root) return
        const el = root.querySelector(`[data-meta-id="${pendingScrollMetaId}"]`) as HTMLElement | null
        if (el && 'scrollIntoView' in el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        } else {
          // Fallback: scroll container to bottom
          try { root.scrollTo({ top: root.scrollHeight, behavior: 'smooth' }) } catch {}
        }
      } finally {
        setPendingScrollMetaId('')
      }
    })
    return () => { try { window.cancelAnimationFrame(raf) } catch {} }
  }, [metasets, pendingScrollMetaId])

  const MetasetNameField = React.useMemo(() => {
    return React.memo(function MetasetNameField({ id, name, idx, highlight }: { id: string; name: string; idx: number; highlight?: boolean }) {
      const [draft, setDraft] = useState(name)
      useEffect(() => { setDraft(name) }, [name, id])
      return (
        <Box sx={{ position: 'relative', display: 'block', width: '100%', borderRadius: 1, overflow: 'visible' }}>
          {highlight && (
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                // Keep glow tightly around the input box; avoid label overlay.
                top: 6,
                right: 0,
                bottom: 0,
                left: 0,
                borderRadius: 'inherit',
                pointerEvents: 'none',
                animation: `${legendaryGlow} 1400ms ease-out`,
                background: 'linear-gradient(145deg, rgba(255,240,180,0.15), rgba(255,208,0,0.12) 40%, rgba(255,150,0,0.10))',
                mixBlendMode: 'screen',
                filter: 'saturate(1.1)',
              }}
            />
          )}
          {highlight && (
            <>
              {[0,1,2,3,4].map((i) => (
                <Box key={i} aria-hidden sx={{
                  position: 'absolute',
                  left: `${10 + i*16}%`,
                  top: '56%',
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'rgba(255, 240, 200, 0.9)',
                  boxShadow: '0 0 6px 2px rgba(255, 210, 120, 0.6)',
                  pointerEvents: 'none',
                  animation: `${sparkleRise} 900ms ease-out`,
                  animationDelay: `${80 * i}ms`,
                }} />
              ))}
            </>
          )}
          <MuiTextField
            size="small"
            label={`Metaset #${idx + 1}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { if (draft !== name) { const next = metasets.map((x,i) => i===idx ? { ...x, name: draft } : x); onMetasetsChange(next) } }}
            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
            fullWidth
            sx={{
              // No margin to keep grid gap uniform
              m: 0,
            }}
          />
        </Box>
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
          <Box
            ref={listRef}
            sx={{
              px: 3,
              py: 2,
              overflowY: 'auto',
              maxHeight: '60vh',
              // Reserve scrollbar gutter so dialog width doesn't shift when it appears
              scrollbarGutter: 'stable both-edges',
            }}
          >
            <Stack spacing={1}>
              {metasets.map((m, idx) => (
                <Box key={m.id} data-meta-id={m.id} sx={{ display: 'grid', gridTemplateColumns: 'auto 240px minmax(0,1fr) auto auto auto auto', gap: 1, alignItems: 'center' }}>
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
                  <MetasetNameField id={m.id} name={m.name} idx={idx} highlight={legendaryMetaId === m.id} />
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
                  <Button color="warning" onClick={() => setConfirmClearMetaId(m.id)} disabled={m.sets.length === 0}>Clear</Button>
                  {(() => {
                    const used = metasetUsageCounts[m.id] || 0
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Button color="error" onClick={() => {
                          const hasSets = m.sets.length > 0
                          if (used === 0 && !hasSets) {
                            // Safe auto-delete: not used and empty
                            onDeleteMetaset(m.id)
                            return
                          }
                          // Otherwise open confirmation; default to delete action
                          setDeleteMode(used > 0 && hasSets ? 'replaceSets' : 'delete')
                          setDeleteReplaceMetaId('')
                          setConfirmDeleteMetaId(m.id)
                        }}>Delete</Button>
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
          <Button onClick={() => {
            const { name, isFun } = generateMetasetNameWithFlag(metasets.map(m => m.name))
            const id = `meta_${Date.now()}`
            setPendingScrollMetaId(id)
            if (isFun) {
              // Trigger a short celebratory glow on the new row's Select
              setLegendaryMetaId(id)
              window.setTimeout(() => setLegendaryMetaId(''), 1600)
            }
            onMetasetsChange(metasets.concat({ id, name, sets: [], show: true }))
          }}>Add metaset</Button>
          <FormControlLabel
            control={<Checkbox size="small" checked={includeAllExplicitMeta} onChange={(e) => onIncludeAllExplicitMetaChange(e.target.checked)} />}
            label={
              <Tooltip title={`Adds an "All (Explicit)" metaset that lists all current sets explicitly (unlike "Any"). Useful so new game sets won't match old rules.`}>
                <span>{'Add explicit metaset for "All"'}</span>
              </Tooltip>
            }
          />
          <Button size="small" variant="outlined" color="error" onClick={() => {
            // Default selection mirrors Delete: prefer replace-with-sets when possible
            try {
              const used = metasets.filter(m => (metasetUsageCounts[m.id] || 0) > 0)
              const anyHasSets = used.some(m => m.sets.length > 0)
              setResetMode(anyHasSets ? 'replaceSets' : 'delete')
            } catch { setResetMode('delete') }
            setResetReplaceMetaId('')
            setConfirmResetMetasets(true)
          }}>Reset to defaults</Button>
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

      {/* Confirm Delete Metaset with replacement options */}
      <Dialog
        open={Boolean(confirmDeleteMetaId)}
        onClose={() => { setConfirmDeleteMetaId(null); setDeleteReplaceMetaId(''); setDeleteMode('delete') }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Delete this metaset?</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1 }}>
          {/* Hidden measurer for confirm button width */}
          {Boolean(confirmDeleteMetaId) && (
            <Box ref={measureRef} sx={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
              <Button variant="contained">Delete and remove references</Button>
              <Button variant="contained">Replace with explicit sets</Button>
              <Button variant="contained">Replace with metaset</Button>
              <Button variant="contained">Delete</Button>
            </Box>
          )}
          {(() => {
            const id = confirmDeleteMetaId
            const m = metasets.find(x => x.id === id)
            const used = id ? (metasetUsageCounts[id] || 0) : 0
            const otherMetas = metasets.filter(x => x.id !== id)
            const hasOtherMetas = otherMetas.length > 0
            const hasSets = Boolean(m && m.sets.length > 0)

            if (!id) return null

            if (used === 0) {
              // Simple confirmation (no replace options)
              return (
                <>
                  <Typography variant="body2">This removes the metaset. No configs reference it.</Typography>
                </>
              )
            }

            // Used > 0: present standard radio-driven choices
            return (
              <>
                <Typography variant="body2" sx={{ mb: 0.5 }}>{used} config(s) reference this metaset.</Typography>
                <Typography variant="body2" color="text.secondary">Choose how to update those configs.</Typography>
                <Divider sx={{ my: 1 }} />
                <RadioGroup
                  value={deleteMode}
                  onChange={(_, v) => setDeleteMode((v as 'delete' | 'replaceSets' | 'replaceMeta') || 'delete')}
                >
                  <FormControlLabel
                    value="delete"
                    control={<Radio />}
                    label="Delete and remove references"
                  />
                  <FormControlLabel
                    value="replaceSets"
                    control={<Radio />}
                    label={hasSets ? 'Replace with explicit sets' : 'Replace with explicit sets (not available — no sets)'}
                    disabled={!hasSets}
                  />
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(240px,1fr)', alignItems: 'center', gap: 1 }}>
                    <FormControlLabel
                      value="replaceMeta"
                      control={<Radio />}
                      label="Replace with another metaset"
                      disabled={!hasOtherMetas}
                    />
                    <Select
                      size="small"
                      value={deleteReplaceMetaId}
                      onChange={(e) => setDeleteReplaceMetaId(e.target.value as string)}
                      displayEmpty
                      disabled={!hasOtherMetas || deleteMode !== 'replaceMeta'}
                      renderValue={(v) => {
                        if (!hasOtherMetas) return 'No metasets to replace with'
                        return v ? (metasets.find(x => x.id === v)?.name ?? v) : 'Choose metaset…'
                      }}
                    >
                      {otherMetas.map((mm) => (
                        <MenuItem key={mm.id} value={mm.id}>{mm.name}</MenuItem>
                      ))}
                    </Select>
                  </Box>
                </RadioGroup>
              </>
            )
          })()}
        </DialogContent>
        <DialogActions>
          {(() => {
            const id = confirmDeleteMetaId
            const used = id ? (metasetUsageCounts[id] || 0) : 0
            const okReplaceMeta = deleteMode === 'replaceMeta' && Boolean(deleteReplaceMetaId)
            return (
              <>
                <Button onClick={() => { setConfirmDeleteMetaId(null); setDeleteReplaceMetaId(''); setDeleteMode('delete') }}>Cancel</Button>
                {used === 0 ? (
                  <Button
                    color="error"
                    sx={{ width: confirmBtnWidth, whiteSpace: 'nowrap' }}
                    onClick={() => {
                      const id2 = confirmDeleteMetaId!
                      setConfirmDeleteMetaId(null)
                      setDeleteReplaceMetaId('')
                      setDeleteMode('delete')
                      onDeleteMetaset(id2)
                    }}
                  >
                    Delete
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="contained"
                      color={deleteMode === 'delete' ? 'error' : 'warning'}
                      disabled={deleteMode === 'replaceMeta' && !okReplaceMeta}
                      sx={{ width: confirmBtnWidth, whiteSpace: 'nowrap' }}
                      onClick={() => {
                        const id2 = confirmDeleteMetaId!
                        const mode = deleteMode
                        const repId = deleteReplaceMetaId
                        setConfirmDeleteMetaId(null)
                        setDeleteReplaceMetaId('')
                        setDeleteMode('delete')
                        if (mode === 'replaceSets') {
                          onDeleteMetaset(id2, { replaceWithSets: true })
                        } else if (mode === 'replaceMeta') {
                          onDeleteMetaset(id2, { replaceWithMetaId: repId })
                        } else {
                          onDeleteMetaset(id2)
                        }
                      }}
                    >
                      {deleteMode === 'delete' ? 'Delete and remove references' : deleteMode === 'replaceSets' ? 'Replace with explicit sets' : 'Replace with metaset'}
                    </Button>
                  </>
                )}
              </>
            )
          })()}
        </DialogActions>
      </Dialog>

      {/* Confirm Reset Metasets */}
      <Dialog open={confirmResetMetasets} onClose={() => setConfirmResetMetasets(false)} maxWidth="md" fullWidth>
        <DialogTitle>Reset metasets to defaults?</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1 }}>
          {(() => {
            const totalRefs = Object.values(metasetUsageCounts).reduce((a, b) => a + (b || 0), 0)
            if (totalRefs === 0) {
              return (
                <Typography variant="body2">No configs reference your current metasets. This will replace your metasets list with defaults.</Typography>
              )
            }
            const defaults = defaultMetasets()
            return (
              <>
                <Typography variant="body2">Some configs reference your current metasets. Choose how to update them.</Typography>
                <Divider sx={{ my: 1 }} />
                <RadioGroup value={resetMode} onChange={(_, v) => setResetMode((v as 'delete' | 'replaceSets' | 'replaceMeta') || 'delete')}>
                  <FormControlLabel value="delete" control={<Radio />} label="Reset and remove metaset references" />
                  <FormControlLabel value="replaceSets" control={<Radio />} label="Reset and replace references with explicit sets" />
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(240px,1fr)', alignItems: 'center', gap: 1 }}>
                    <FormControlLabel value="replaceMeta" control={<Radio />} label="Reset and replace references with metaset" />
                    <Select
                      size="small"
                      value={resetReplaceMetaId}
                      onChange={(e) => setResetReplaceMetaId(e.target.value as string)}
                      disabled={resetMode !== 'replaceMeta'}
                      displayEmpty
                      renderValue={(v) => v ? (defaults.find(x => x.id === v)?.name ?? v) : 'Choose metaset…'}
                    >
                      {defaults.map(m => (
                        <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                      ))}
                    </Select>
                  </Box>
                </RadioGroup>
              </>
            )
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetMetasets(false)}>Cancel</Button>
          <Button
            variant="contained"
            color={resetMode === 'delete' ? 'error' : 'warning'}
            disabled={resetMode === 'replaceMeta' && !resetReplaceMetaId}
            onClick={() => {
              const ids = metasets.map(m => m.id)
              // Apply to all metasets (safe: onDeleteMetaset is a no-op for non-referenced IDs)
              if (resetMode === 'replaceSets') {
                ids.forEach(id => onDeleteMetaset(id, { replaceWithSets: true }))
              } else if (resetMode === 'replaceMeta') {
                const rep = resetReplaceMetaId
                ids.forEach(id => onDeleteMetaset(id, { replaceWithMetaId: rep }))
              } else {
                ids.forEach(id => onDeleteMetaset(id))
              }
              // Swap metasets list to defaults
              onMetasetsChange(defaultMetasets())
              setConfirmResetMetasets(false)
              setResetMode('delete')
              setResetReplaceMetaId('')
            }}
          >
            {resetMode === 'delete' ? 'Reset and remove references' : resetMode === 'replaceSets' ? 'Reset and use explicit sets' : 'Reset and use metaset'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
/**
 * MetasetsDialog
 *
 * Modal editor for managing named metasets (groups of artifact set IDs).
 * Allows rename, toggle visibility, and set membership edits.
 */
