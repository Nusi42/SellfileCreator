import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Select, Stack, TextField as MuiTextField, Tooltip, Typography, Divider, Radio, RadioGroup, ListSubheader } from '@mui/material'
import { useI18n } from '../lib/i18n'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import EllipsisTooltip from './EllipsisTooltip'
import type { Metaset } from '../lib/metasets'
import { artifactSetName, filterAndSortSetEntries } from '../lib/types'
import { defaultMetasets, makeMetasetId } from '../lib/metasets'
// no constants needed here; sizes handled in SetsOrderControls
import { generateMetasetNameWithFlag } from '../lib/namegen'
import { keyframes } from '@emotion/react'
import SetMenuSection from './SetMenuSection'
import SetsOrderControls from './SetsOrderControls'
import { MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_SCROLL_GUTTER_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, SETS_MENU_WIDTH_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, BUILDER_TOGGLE_BUTTON_HEIGHT_PX } from '../lib/constants'

export default function MetasetsDialog({
  open,
  onClose,
  metasets,
  onMetasetsChange,
  onDeleteMetaset,
  setUsageCounts,
  metasetUsageCounts,
  onSelectConfigsByMetaset,
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
  setUsageCounts: Record<number, number>
  metasetUsageCounts: Record<string, number>
  // When the "Used" chip is clicked, select all configs that reference this metaset.
  onSelectConfigsByMetaset: (id: string) => void
  setsSearch: string
  onSetsSearchChange: (v: string) => void
  setsOrder: 'game' | 'az' | 'icons'
  onSetsOrderChange: (v: 'game' | 'az' | 'icons') => void
  metaSetsMenuOpen: boolean
  setMetaSetsMenuOpen: (v: boolean) => void
}) {
  const { t } = useI18n()
  // Note: Ordering state is owned by the Builder and passed in via props to keep
  // behavior identical between Builder and Metasets editor. No persistence here.
  const [confirmResetMetasets, setConfirmResetMetasets] = useState(false)
  // Fixed screen anchor for per-row Sets menus so header position doesn't move when height changes
  const [setsMenuAnchorPos, setSetsMenuAnchorPos] = useState<{ top: number; left: number } | null>(null)
  const [resetMode, setResetMode] = useState<'delete' | 'replaceSets' | 'replaceMeta'>('delete')
  const [resetReplaceMetaId, setResetReplaceMetaId] = useState<string>('')
  const [confirmDeleteMetaId, setConfirmDeleteMetaId] = useState<string | null>(null)
  const [confirmClearMetaId, setConfirmClearMetaId] = useState<string | null>(null)
  const [deleteReplaceMetaId, setDeleteReplaceMetaId] = useState<string | ''>('')
  const [deleteMode, setDeleteMode] = useState<'delete' | 'replaceSets' | 'replaceMeta'>('delete')
  const [confirmBtnWidth, setConfirmBtnWidth] = useState<number>(320)
  const [resetConfirmBtnWidth, setResetConfirmBtnWidth] = useState<number>(320)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const measureResetRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  // Paper element for the per-row Sets select menu; used to measure actual
  // height after mount to refine the anchored position precisely.
  const setsRowMenuPaperRef = useRef<HTMLDivElement | null>(null)
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

  // No dynamic width measurements: keep the header width fixed to the menu
  // Paper width so it does not jump when switching modes.

  // Measure the widest possible confirm button label and lock the button width
  useEffect(() => {
    const raf = confirmDeleteMetaId
      ? window.requestAnimationFrame(() => {
        try {
          const root = measureRef.current
          const btns = root ? Array.from(root.querySelectorAll('button')) as HTMLButtonElement[] : []
          let max = 0
          btns.forEach((b) => { max = Math.max(max, b.clientWidth) })
          max > 0 && setConfirmBtnWidth(max)
        } catch {}
      })
      : null
    return () => { typeof raf === 'number' && window.cancelAnimationFrame(raf) }
  }, [confirmDeleteMetaId])

  // Measure widest possible label for the Reset metasets dialog's confirm button
  useEffect(() => {
    const raf = confirmResetMetasets
      ? window.requestAnimationFrame(() => {
        try {
          const root = measureResetRef.current
          const btns = root ? Array.from(root.querySelectorAll('button')) as HTMLButtonElement[] : []
          let max = 0
          btns.forEach((b) => { max = Math.max(max, b.clientWidth) })
          max > 0 && setResetConfirmBtnWidth(max)
        } catch {}
      })
      : null
    return () => { typeof raf === 'number' && window.cancelAnimationFrame(raf) }
  }, [confirmResetMetasets])

  // When a metaset is added, scroll it into view to reduce friction
  useEffect(() => {
    const raf = pendingScrollMetaId
      ? window.requestAnimationFrame(() => {
        try {
          const root = listRef.current
          const target = root ? root.querySelector(`[data-meta-id="${pendingScrollMetaId}"]`) as HTMLElement | null : null
          if (target && 'scrollIntoView' in target) {
            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          } else {
            root && root.scrollTo({ top: root.scrollHeight, behavior: 'smooth' })
          }
        } finally {
          setPendingScrollMetaId('')
        }
      })
      : null
    return () => { typeof raf === 'number' && window.cancelAnimationFrame(raf) }
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
        <DialogTitle>{t('titleManageMetasets')}</DialogTitle>
        <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }} data-tour-id="metasets.dialog">
          {/* Sticky header: description only */}
          <Box sx={{ position: 'sticky', top: 0, zIndex: 1, px: 3, pt: 2, pb: 1 }}>
            <Typography variant="body2" color="text.secondary">{t('metasetsHeaderBlurb')}</Typography>
            <Divider sx={{ mt: 1, opacity: 0.5 }} />
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
                    <Tooltip title={t('metasetsMoveUp')}>
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
                    <Tooltip title={t('metasetsMoveDown')}>
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
                      onOpen={(e) => {
                        setMetaSetsMenuOpen(true)
                        try {
                          const el = (e?.currentTarget as HTMLElement | null)
                          const rect = el?.getBoundingClientRect()
                          const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
                          const margin = 8
                          // dialog picker has only Sets header
                          const theoreticalMax = MENU_MAX_HEIGHT_SETS_LIST_PX + MENU_MAX_HEIGHT_EXTRA_BUFFER
                          const desiredTop = rect ? Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - theoreticalMax - margin)) : margin
                          const desiredLeft = rect ? Math.floor(rect.left) : margin
                          setSetsMenuAnchorPos({ top: desiredTop, left: desiredLeft })
                          // After mount, measure real height and refine anchor
                          const refine = () => {
                            try {
                              const paper = setsRowMenuPaperRef.current
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
                      onClose={() => { setMetaSetsMenuOpen(false); setSetsMenuAnchorPos(null) }}
                      MenuProps={{
                        PaperProps: { sx: { width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX }, maxWidth: SETS_MENU_WIDTH_PX, overflowX: 'hidden' }, ref: (el: HTMLDivElement | null) => { setsRowMenuPaperRef.current = el } },
                        MenuListProps: { sx: { width: '100%', maxWidth: '100%' } },
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
                        const sorted = filterAndSortSetEntries(setsSearch, setsOrder)
                        return (
                          <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                            {/* Keep header outside the scrollable items to avoid position jumps */}
                            <ListSubheader sx={{ opacity: 0.7, py: 0.5, my: 0, lineHeight: 2, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX }}>
                              <Box
                                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, pr: `${MENU_SCROLL_GUTTER_PX}px` }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <SetsOrderControls
                                  setsSearch={setsSearch}
                                  onSetsSearchChange={onSetsSearchChange}
                                  setsOrder={setsOrder}
                                  onSetsOrderChange={onSetsOrderChange}
                                  zeroResults={sorted.length === 0}
                                />
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
                                  // List modes: fixed height and always show a vertical scrollbar
                                  // to keep width identical to icon mode.
                                      maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX,
                                      height: MENU_MAX_HEIGHT_SETS_LIST_PX,
                                      overflowY: 'scroll',
                                    }),
                                pr: `${MENU_SCROLL_GUTTER_PX}px`,
                                scrollbarGutter: 'stable both-edges',
                              }}
                            >
                              <SetMenuSection
                                title={t('setsTitle')}
                                sorted={sorted}
                                setsOrder={setsOrder}
                                metasets={metasets}
                                excludeMetasetId={m.id}
                                setUsageCounts={setUsageCounts}
                                valueForSet={(id) => String(id)}
                                hideHeader
                                selectedSetIds={m.sets}
                                onToggleSet={(id) => {
                                  // Toggle membership of this set for the current metaset row.
                                  const nextIds = new Set<number>(m.sets)
                                  if (nextIds.has(id)) nextIds.delete(id); else nextIds.add(id)
                                  const arr = Array.from(nextIds)
                                  arr.sort((a, b) => a - b)
                                  const next = metasets.map((x,i) => i===idx ? { ...x, sets: arr } : x)
                                  onMetasetsChange(next)
                                }}
                              />
                            </Box>
                          </Box>
                        )
                      })()}
                    </Select>
                  </EllipsisTooltip>
                  {/* Visibility toggle */}
                  <Box sx={{ justifySelf: 'end' }}>
                    <Tooltip title={m.show === false ? t('metasetsHiddenFromMenus') : t('metasetsVisibleInMenus')}>
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
                        {m.show === false ? t('headerMenuHidden') : t('headerMenuShown')}
                      </Button>
                    </Tooltip>
                  </Box>
                  <Button
                    size="small"
                    color="warning"
                    onClick={() => setConfirmClearMetaId(m.id)}
                    disabled={m.sets.length === 0}
                    sx={{ height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX, minHeight: BUILDER_TOGGLE_BUTTON_HEIGHT_PX, whiteSpace: 'nowrap' }}
                  >
                    {t('clear')}
                  </Button>
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
                        }}>{t('delete')}</Button>
                        {used > 0 ? (
                          <Tooltip title={t('metasetsUsesTooltip')}>
                            <Chip
                              size="small"
                              label={t('metasetsUses', { n: used })}
                              color={'warning'}
                              sx={{ width: 84, justifyContent: 'center', cursor: 'pointer' }}
                              onClick={() => {
                                try { onSelectConfigsByMetaset(m.id) } catch {}
                                // Close the dialog so the selection is visible in the chips list
                                try { onClose() } catch {}
                              }}
                            />
                          </Tooltip>
                        ) : (
                          <Chip
                            size="small"
                            label={t('metasetsUses', { n: used })}
                            color={'default'}
                            sx={{ width: 84, justifyContent: 'center' }}
                          />
                        )}
                      </Box>
                    )
                  })()}
                </Box>
              ))}
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button data-tour-id="metasets.add" onClick={() => {
            const { name, isFun } = generateMetasetNameWithFlag(metasets.map(m => m.name))
            const id = makeMetasetId()
            setPendingScrollMetaId(id)
            if (isFun) {
              // Trigger a short celebratory glow on the new row's Select
              setLegendaryMetaId(id)
              window.setTimeout(() => setLegendaryMetaId(''), 1600)
            }
            onMetasetsChange(metasets.concat({ id, name, sets: [], show: true }))
          }}>{t('addMetaset')}</Button>
          
          <Button size="small" variant="outlined" color="error" onClick={() => {
            // Default selection mirrors Delete: prefer replace-with-sets when possible
            try {
              const used = metasets.filter(m => (metasetUsageCounts[m.id] || 0) > 0)
              const anyHasSets = used.some(m => m.sets.length > 0)
              setResetMode(anyHasSets ? 'replaceSets' : 'delete')
            } catch { setResetMode('delete') }
            setResetReplaceMetaId('')
            setConfirmResetMetasets(true)
          }}>{t('resetToDefaults')}</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose} data-tour-id="metasets.close">{t('close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Clear Metaset */}
      <Dialog open={Boolean(confirmClearMetaId)} onClose={() => setConfirmClearMetaId(null)}>
        <DialogTitle>{t('titleClearMetaset')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgClearMetaset')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearMetaId(null)}>{t('cancel')}</Button>
          <Button
            size="small"
            color="warning"
            onClick={() => {
              const id = confirmClearMetaId!
              setConfirmClearMetaId(null)
              const next = metasets.map(m => m.id === id ? { ...m, sets: [] } : m)
              onMetasetsChange(next)
            }}
            sx={{ height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX, minHeight: BUILDER_TOGGLE_BUTTON_HEIGHT_PX, whiteSpace: 'nowrap' }}
          >
            {t('clear')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete Metaset with replacement options */}
      <Dialog
        open={Boolean(confirmDeleteMetaId)}
        onClose={() => { setConfirmDeleteMetaId(null); setDeleteReplaceMetaId(''); setDeleteMode('delete') }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('titleDeleteMetaset')}</DialogTitle>
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
              <Typography variant="body2">{t('msgNoRefs')}</Typography>
                </>
              )
            }

            // Used > 0: present standard radio-driven choices
            return (
              <>
                <Typography variant="body2" sx={{ mb: 0.5 }}>{t('refsCount', { n: used })}</Typography>
                <Typography variant="body2" color="text.secondary">{t('msgChooseUpdate')}</Typography>
                <Divider sx={{ my: 1, opacity: 0.5 }} />
                <RadioGroup
                  value={deleteMode}
                  onChange={(_, v) => setDeleteMode((v as 'delete' | 'replaceSets' | 'replaceMeta') || 'delete')}
                >
                  <FormControlLabel value="delete" control={<Radio />} label={t('metasetsDeleteRemoveRefsLabel')} />
                  <FormControlLabel value="replaceSets" control={<Radio />} label={hasSets ? t('metasetsDeleteReplaceWithSetsLabel') : t('metasetsDeleteReplaceWithSetsNotAvailable')} disabled={!hasSets} />
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(240px,1fr)', alignItems: 'center', gap: 1 }}>
                    <FormControlLabel value="replaceMeta" control={<Radio />} label={t('metasetsDeleteReplaceWithMetasetLabel')} disabled={!hasOtherMetas} />
                    <Select
                      size="small"
                      value={deleteReplaceMetaId}
                      onChange={(e) => setDeleteReplaceMetaId(e.target.value as string)}
                      displayEmpty
                      disabled={!hasOtherMetas || deleteMode !== 'replaceMeta'}
                      renderValue={(v) => {
                        if (!hasOtherMetas) return t('metasetsNoMetasetsToReplaceWith')
                        return v ? (metasets.find(x => x.id === v)?.name ?? v) : t('metasetsChooseMetasetPlaceholder')
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
                <Button onClick={() => { setConfirmDeleteMetaId(null); setDeleteReplaceMetaId(''); setDeleteMode('delete') }}>{t('cancel')}</Button>
                {used === 0 ? (
                  <Button
                    color="error"
                    onClick={() => {
                      const id2 = confirmDeleteMetaId!
                      setConfirmDeleteMetaId(null)
                      setDeleteReplaceMetaId('')
                      setDeleteMode('delete')
                      onDeleteMetaset(id2)
                    }}
                  >
                    {t('delete')}
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
                      {deleteMode === 'delete'
                        ? t('metasetsDeleteRemoveRefsLabel')
                        : deleteMode === 'replaceSets'
                          ? t('metasetsDeleteReplaceWithSetsLabel')
                          : t('metasetsDeleteReplaceWithMetasetLabel')}
                    </Button>
                  </>
                )}
              </>
            )
          })()}
        </DialogActions>
      </Dialog>

      {/* Confirm Reset Metasets */}
      <Dialog open={confirmResetMetasets} onClose={() => setConfirmResetMetasets(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('titleResetMetasets')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1 }}>
          {/* Hidden measurer for confirm button width (covers all labels) */}
          {confirmResetMetasets && (
            <Box ref={measureResetRef} sx={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
              <Button variant="contained">{t('metasetsResetRemoveRefs')}</Button>
              <Button variant="contained">{t('metasetsResetUseExplicitSets')}</Button>
              <Button variant="contained">{t('metasetsResetUseMetaset')}</Button>
            </Box>
          )}
          {(() => {
            const totalRefs = Object.values(metasetUsageCounts).reduce((a, b) => a + (b || 0), 0)
            if (totalRefs === 0) {
              return (
                  <Typography variant="body2">{t('msgResetNoRefs')}</Typography>
              )
            }
            const defaults = defaultMetasets()
            return (
              <>
                    <Typography variant="body2">{t('msgResetSomeRefs')}</Typography>
                <Divider sx={{ my: 1, opacity: 0.5 }} />
                <RadioGroup value={resetMode} onChange={(_, v) => setResetMode((v as 'delete' | 'replaceSets' | 'replaceMeta') || 'delete')}>
                  <FormControlLabel value="delete" control={<Radio />} label={t('metasetsResetRemoveRefsLabel')} />
                  <FormControlLabel value="replaceSets" control={<Radio />} label={t('metasetsResetReplaceWithSetsLabel')} />
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(240px,1fr)', alignItems: 'center', gap: 1 }}>
                    <FormControlLabel value="replaceMeta" control={<Radio />} label={t('metasetsResetReplaceWithMetasetLabel')} />
                    <Select
                      size="small"
                      value={resetReplaceMetaId}
                      onChange={(e) => setResetReplaceMetaId(e.target.value as string)}
                      disabled={resetMode !== 'replaceMeta'}
                      displayEmpty
                      renderValue={(v) => v ? (defaults.find(x => x.id === v)?.name ?? v) : t('metasetsChooseMetasetPlaceholder')}
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
          <Button onClick={() => setConfirmResetMetasets(false)}>{t('cancel')}</Button>
          <Button
            variant="contained"
            color={resetMode === 'delete' ? 'error' : 'warning'}
            disabled={resetMode === 'replaceMeta' && !resetReplaceMetaId}
            sx={{ width: resetConfirmBtnWidth, whiteSpace: 'nowrap' }}
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
            {resetMode === 'delete'
              ? t('metasetsResetRemoveRefs')
              : resetMode === 'replaceSets'
                ? t('metasetsResetUseExplicitSets')
                : t('metasetsResetUseMetaset')}
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
