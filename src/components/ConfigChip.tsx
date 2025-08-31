import { useEffect, useState } from 'react'
import { Box, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import {
  factionCodeToName,
  formatRank,
  labelOfVariant,
  mainToVariant,
  rarityCodeToName,
  statNameFromId,
  StatVariant,
  variantToSub,
} from '../lib/types'

export default function ConfigChip({
  index,
  cfg,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onMoveTop,
  onMoveBottom,
  onPasteAfter,
  selected,
  onSelect,
  isLast,
  linkedHover,
  onHover,
  metasets,
}: {
  index: number
  cfg: BuilderConfig
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveTop: () => void
  onMoveBottom: () => void
  onPasteAfter: () => void
  selected: boolean
  onSelect: () => void
  isLast: boolean
  linkedHover: boolean
  onHover: (enter: boolean) => void
  metasets: Metaset[]
}) {
  const ellipsizeName = (s: string, max = 20) => (s.length <= max ? s : s.slice(0, max - 1) + '…')
  const fullSummary = summaryOf(cfg, metasets)
  const m = /^Act:\s*(Keep|Sell)\s*(?:\|\s*)?(.*)$/.exec(fullSummary)
  const actText = m ? m[1] : (cfg.keep ? 'Keep' : 'Sell')
  const restSummary = m ? m[2] : fullSummary
  const keepColor = cfg.keep ? 'success.main' : 'error.main'
  const isDisabled = cfg.enabled === false
  const [menu, setMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  useEffect(() => {
    if (!menu?.open) return
    const handler = (e: MouseEvent) => { e.preventDefault() }
    window.addEventListener('contextmenu', handler)
    return () => { window.removeEventListener('contextmenu', handler) }
  }, [menu?.open])
  return (
    <Box
      id={`cfg-chip-${index}`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : (linkedHover ? 'primary.main' : 'divider'),
        backgroundColor: selected ? 'action.selected' : (linkedHover ? 'action.hover' : 'transparent'),
        borderRadius: 5,
        pl: 1.2,
        pr: 0.5,
        py: 0.5,
        cursor: 'pointer',
      }}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onContextMenu={(e) => { try { e.preventDefault(); e.stopPropagation() } catch {} setMenu({ open: true, x: e.clientX, y: e.clientY }) }}
    >
      <Typography variant="caption" sx={{ mr: 0.5 }}>
        <Tooltip title="Click to edit this config"><Box component="span" sx={{ display: 'inline' }}>
          {`${index + 1}. `}
          {cfg.name ? `${ellipsizeName(cfg.name)} — ` : ''}
          {isDisabled ? (
            <Box component="span" sx={{ color: 'common.white', textDecoration: 'line-through' }}>
              <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
            </Box>
          ) : (
            <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
          )}
          {restSummary ? ` | ${restSummary}` : ''}
        </Box></Tooltip>
      </Typography>
      <Tooltip title="Move up"><span><IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveUp() }} disabled={index === 0}><ArrowUpwardIcon fontSize="inherit" /></IconButton></span></Tooltip>
      <Tooltip title="Move down"><span><IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveDown() }} disabled={isLast}><ArrowDownwardIcon fontSize="inherit" /></IconButton></span></Tooltip>
      <Tooltip title="Duplicate"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onDuplicate() }}><ContentCopyIcon fontSize="inherit" /></IconButton></Tooltip>
      <Tooltip title="Delete"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete() }} color="error"><DeleteIcon fontSize="inherit" /></IconButton></Tooltip>
      <Menu
        open={Boolean(menu?.open)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        {...(menu?.open ? { anchorPosition: { top: menu.y, left: menu.x } } : {})}
      >
        <MenuItem onClick={() => { setMenu(null); onDuplicate() }}>Duplicate</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveTop() }} disabled={index === 0}>Move to Top</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveUp() }} disabled={index === 0}>Move Up</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveDown() }} disabled={isLast}>Move Down</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveBottom() }} disabled={isLast}>Move to Bottom</MenuItem>
        <MenuItem onClick={async () => {
          setMenu(null)
          const text = JSON.stringify(cfg, null, 2)
          let ok = false
          try { if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') { await navigator.clipboard.writeText(text); ok = true } } catch { ok = false }
          if (!ok) {
            try { const ev = new CustomEvent('open-copy-dialog', { detail: text }); window.dispatchEvent(ev) } catch {}
          }
        }}>Copy to Clipboard</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onPasteAfter() }}>Paste after</MenuItem>
        <Divider />
        <MenuItem onClick={() => { setMenu(null); onDelete() }} sx={{ color: 'error.main' }}>Delete</MenuItem>
      </Menu>
    </Box>
  )
}

function summaryOf(cfg: BuilderConfig, metasets: Metaset[]): string {
  const parts: string[] = []
  const ellipsize = (s: string, max = 20) => (s.length <= max ? s : s.slice(0, max - 1) + '…')
  const push = (label: string, value: string) => parts.push(`${label}:${ellipsize(value)}`)

  push('Act', cfg.keep ? 'Keep' : 'Sell')
  {
    const r = formatRank(cfg.rankCode)
    if (r) push('Rank', r)
  }
  {
    const rar = rarityCodeToName(cfg.rarityCode)
    if (rar) push('Rar', rar)
  }
  if (cfg.factionCode && cfg.factionCode !== 0) push('Fac', factionCodeToName(cfg.factionCode))

  {
    const vars: StatVariant[] | undefined = (cfg as unknown as { mainStatVariants?: StatVariant[] }).mainStatVariants
    if (Array.isArray(vars) && vars.length > 0) {
      const names = vars.map(v => labelOfVariant(v)).filter(Boolean)
      push('Main', names.join(','))
    } else if ((cfg.mainStats?.length ?? 0) > 0) {
      const names = (cfg.mainStats ?? []).map(m => labelOfVariant(mainToVariant(m.id, m.f))).filter(Boolean)
      push('Main', names.join(','))
    } else {
      push('Main', 'Any')
    }
  }

  {
    const subVars: StatVariant[] | undefined = (cfg as unknown as { substatVariants?: StatVariant[] }).substatVariants
    const fixedVars: StatVariant[] | undefined = (cfg as unknown as { fixedSubstatVariants?: StatVariant[] }).fixedSubstatVariants
    if (Array.isArray(subVars) && subVars.length > 0) {
      const fixedSet = new Set((fixedVars ?? []).map(v => { const o = variantToSub(v); return `${o.id}:${Boolean(o.isFlat)}` }))
      const names = subVars.map(v => {
        const o = variantToSub(v)
        const lock = fixedSet.has(`${o.id}:${Boolean(o.isFlat)}`) ? '🔒' : ''
        return `${statNameFromId(o.id, o.isFlat)}${lock}`
      })
      push('Subs', names.join(','))
    } else if ((cfg.substats?.length ?? 0) > 0) {
      const fixedSet = new Set((cfg.fixedSubstats ?? []).map(s => `${s.id}:${Boolean(s.isFlat)}`))
      const names = (cfg.substats ?? []).map(s => `${statNameFromId(s.id, s.isFlat)}${fixedSet.has(`${s.id}:${Boolean(s.isFlat)}`) ? '🔒' : ''}`)
      push('Subs', names.join(','))
    } else {
      push('Subs', 'Any')
    }
  }

  if (cfg.substatRollBounds && Object.keys(cfg.substatRollBounds).length > 0) {
    const tags: string[] = []
    for (const [k, v] of Object.entries(cfg.substatRollBounds)) {
      const [idStr, flatStr] = k.split(':')
      const id = Number(idStr)
      const isFlat = flatStr === 'true'
      const n = statNameFromId(id, isFlat)
      const min = typeof v.min === 'number' ? Math.max(0, Math.min(5, Math.floor(v.min))) : undefined
      const max = typeof v.max === 'number' ? Math.max(0, Math.min(5, Math.floor(v.max))) : undefined
      let t = ''
      if (min !== undefined && max !== undefined && min === max) t = `${n}=${min}r`
      else if (max === 0 && (min === undefined || min === 0)) t = `${n}=0r`
      else if (min !== undefined) t = `${n}≥${min}r`
      else if (max !== undefined) t = `${n}≤${max}r`
      if (t) tags.push(t)
    }
    if (tags.length) push('Rolls', tags.join(','))
  }

  const setNames = (cfg.artifactSets ?? []).map(s => s).join(',')
  const metaNames = (cfg.artifactMetaSets ?? []).map(id => metasets.find(m => m.id === id)?.name || id)
  const setsJoined = [...metaNames, ...setNames].join(',')
  if (setsJoined) push('Sets', setsJoined)

  return parts.join(' | ')
}
