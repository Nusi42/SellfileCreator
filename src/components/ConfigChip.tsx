import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { Box, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import {
  factionCodeToName,
  labelOfVariant,
  artifactSetName,
  compareVariants,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  artifactTypeName,
  artifactTypeI18nKey,
  compareArtifactTypes,
  artifactSetI18nKey,
  statVariantI18nKey,
  factionI18nKey,
} from '../lib/types'
import { NBSP, CHIP_ROLL_BADGE_FONT_SIZE_PX, CHIP_ROLL_BADGE_SIZE_PX, HOVER_BG_ALPHA, SELECTED_HOVER_BG_ALPHA } from '../lib/constants'
import { resolveAutoRarityCode } from '../lib/hsfBuilder'
import { artifactTypeIconFor } from './artifactTypeIcons'
import EllipsisTooltip from './EllipsisTooltip'
import { useScrollingFlag } from '../hooks/useScrollingFlag'
import { useI18n } from '../lib/i18n'
import { FactionIcon } from './FactionIcon'
import { useDisplayPreferences } from '../state/preferencesState'
import { SetIcon } from './SetIcon'
import { DEFAULT_METASET_ICON_ID, metasetIconOptionById } from '../lib/metasetIcons'
import type { MetasetIconId } from '../lib/metasetIcons'

// Separate baseline nudges keep bitmap faction icons and font slot icons visually centered.
const CONFIG_CHIP_FACTION_ICON_OFFSET_EM = -0.45
const CONFIG_CHIP_SLOT_ICON_OFFSET_EM = -0.20
const CONFIG_CHIP_SET_ICON_OFFSET_EM = -0.35
const CONFIG_CHIP_SET_ICON_TRANSLATE_Y_PX = 4
const CONFIG_CHIP_SET_ICON_TRANSLATE_WITH_TEXT_PX = -1

interface ConfigChipProps {
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
  onSelect: (e: React.MouseEvent) => void
  onCopy: () => void
  onCopyDev?: () => void
  isLast: boolean
  linkedHover: boolean
  onHover: (enter: boolean) => void
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  isDuplicate?: boolean
  duplicateOfIndex?: number
}

function ConfigChip({
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
  onCopy,
  onCopyDev,
  isLast,
  linkedHover,
  onHover,
  metasets,
  substatColors,
  isDuplicate,
  duplicateOfIndex,
}: ConfigChipProps) {
  const { t } = useI18n()
  const { showFactionIcons, statButtonBorders, showSetIcons } = useDisplayPreferences()
  // Dev builds expose extra clipboard utilities via the chip context menu.
  const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  // Build compact summary without redundant labels; act is rendered separately
  const actText = cfg.keep ? t('keepValueKeep') : t('keepValueSell')
  const restSummary = useMemo(
    () => summaryParts(cfg, metasets, { substatColors, useStatButtonColors: statButtonBorders, showFactionIcons, showSetIcons, t }),
    [cfg, metasets, substatColors, statButtonBorders, showFactionIcons, showSetIcons, t],
  )
  const keepColor = cfg.keep ? 'success.main' : 'error.main'
  const isDisabled = cfg.enabled === false
  const [menu, setMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => { e.preventDefault() }
    const cleanup = menu?.open
      ? (() => {
        window.addEventListener('contextmenu', handler)
        return () => { window.removeEventListener('contextmenu', handler) }
      })()
      : undefined
    return cleanup
  }, [menu?.open])
  const [overName, setOverName] = useState(false)
  const [overControls, setOverControls] = useState(false)
  const [chipHover, setChipHover] = useState(false)
  const scrolling = useScrollingFlag()
  const nameRef = useRef<HTMLElement | null>(null)
  const [nameEllipsized, setNameEllipsized] = useState(false)
  const measureNameEllipsis = () => {
    try {
      const el = nameRef.current
      if (!el) return false
      const cs = getComputedStyle(el)
      const isEllipsisStyle = (cs.overflow === 'hidden' || cs.overflowX === 'hidden') && cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap'
      const rectW = Math.floor(el.getBoundingClientRect().width || 0)
      const scrollW = Math.floor(el.scrollWidth || 0)
      return isEllipsisStyle && scrollW > 0 && rectW + 2 < scrollW
    } catch { return false }
  }
  const tooltipTitle = useMemo(() => {
    if (isDuplicate && typeof duplicateOfIndex === 'number') {
      return t('chipTooltipDuplicateOf', { n: duplicateOfIndex + 1 })
    }
    return t('chipTooltipEdit')
  }, [duplicateOfIndex, isDuplicate, t])

  return (
    <Tooltip
      title={tooltipTitle}
      // Suppress while scrolling so the tooltip doesn't appear at a stale anchor.
      slotProps={{ popper: { disablePortal: true } }}
      open={chipHover && !(overName && nameEllipsized) && !overControls && !scrolling}
    >
    <Box
      id={`cfg-chip-${index}`}
      data-tour-id={selected ? 'chip.selected' : undefined}
      sx={(theme) => {
        const hoverBg = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? HOVER_BG_ALPHA.dark : HOVER_BG_ALPHA.light)
        const selectedHoverBg = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? SELECTED_HOVER_BG_ALPHA.dark : SELECTED_HOVER_BG_ALPHA.light)
        const backgroundColor = linkedHover
          ? (selected ? selectedHoverBg : hoverBg)
          : (selected ? theme.palette.action.selected : 'transparent')
        const borderColor = selected
          ? theme.palette.primary.main
          : (linkedHover ? theme.palette.primary.main : (isDuplicate ? theme.palette.error.main : theme.palette.divider))
        return {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          maxWidth: '100%',
          overflow: 'hidden',
          border: '1px solid',
          // Selection has highest priority, then hover, then duplicate warning.
          borderColor,
          backgroundColor,
          borderRadius: 5,
          pl: 1.2,
          pr: 0.5,
          py: 0.5,
          cursor: 'pointer',
        }
      }}
      onClick={(e) => onSelect(e)}
      onMouseEnter={() => { onHover(true); setChipHover(true) }}
      onMouseLeave={() => { onHover(false); setChipHover(false) }}
      onContextMenu={(e) => { try { e.preventDefault(); e.stopPropagation() } catch {} setMenu({ open: true, x: e.clientX, y: e.clientY }) }}
    >
      <Typography
        variant="caption"
        sx={{
          mr: 0.5,
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          // Clamp the text summary to 2 lines and let the browser
          // decide where to truncate. This replaces ad-hoc per-field
          // character limits and makes better use of available width.
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          wordBreak: 'break-word',
        }}
      >
          <Box component="span" sx={{ display: 'inline' }}>
          {`${index + 1}. `}
          {isDisabled ? (
            <Box component="span" sx={{ color: 'common.white', textDecoration: 'line-through' }}>
              <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
            </Box>
          ) : (
            <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
          )}
          {cfg.name ? (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', maxWidth: '45%', minWidth: 0, verticalAlign: 'baseline' }} onMouseEnter={() => { setOverName(true); setNameEllipsized(measureNameEllipsis()) }} onMouseLeave={() => { setOverName(false); setNameEllipsized(false) }}>
              <Box component="span" sx={{ px: 0.25, lineHeight: 'inherit' }}>—</Box>
              <EllipsisTooltip title={cfg.name}>
                <Box
                  component="span"
                  data-ellipsis-target
                  ref={(el) => { nameRef.current = el as unknown as HTMLElement | null }}
                  sx={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 'inherit',
                  }}
                >
                  {cfg.name}
                </Box>
              </EllipsisTooltip>
            </Box>
          ) : null}
          {restSummary && (
            <>
              {' | '}
              {restSummary}
            </>
          )}
        </Box>
      </Typography>
      <Tooltip title={t('chipBtnMoveUp')} slotProps={{ popper: { disablePortal: true } }}>
        <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveUp() }} disabled={index === 0}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('chipBtnMoveDown')} slotProps={{ popper: { disablePortal: true } }}>
        <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveDown() }} disabled={isLast}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('chipBtnDuplicate')} slotProps={{ popper: { disablePortal: true } }}>
        <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDuplicate() }}><ContentCopyIcon fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('chipBtnDelete')} slotProps={{ popper: { disablePortal: true } }}>
        <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete() }} color="error"><DeleteIcon fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
      <Menu
        open={Boolean(menu?.open)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        {...(menu?.open ? { anchorPosition: { top: menu.y, left: menu.x } } : {})}
        slotProps={{ paper: { 'data-tour-id': 'chip.menu' } as unknown as MuiPaperProps }}
      >
        <MenuItem onClick={() => { setMenu(null); onDuplicate() }}>{t('chipMenuDuplicate')}</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveTop() }} disabled={index === 0}>{t('chipMenuMoveTop')}</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveUp() }} disabled={index === 0}>{t('chipMenuMoveUp')}</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveDown() }} disabled={isLast}>{t('chipMenuMoveDown')}</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveBottom() }} disabled={isLast}>{t('chipMenuMoveBottom')}</MenuItem>
        <MenuItem onClick={async () => { setMenu(null); onCopy() }}>{t('chipMenuCopy')}</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onPasteAfter() }}>{t('chipMenuPasteAfter')}</MenuItem>
        {isDev && onCopyDev ? (
          <MenuItem onClick={async () => { setMenu(null); try { await onCopyDev() } catch {} }}>Copy config + rules (dev)</MenuItem>
        ) : null}
        <Divider />
        <MenuItem onClick={() => { setMenu(null); onDelete() }} sx={{ color: 'error.main' }}>{t('chipMenuDelete')}</MenuItem>
      </Menu>
    </Box>
    </Tooltip>
  )
}

function areConfigChipPropsEqual(prev: Readonly<ConfigChipProps>, next: Readonly<ConfigChipProps>): boolean {
  return prev.cfg === next.cfg
    && prev.index === next.index
    && prev.selected === next.selected
    && prev.isLast === next.isLast
    && prev.linkedHover === next.linkedHover
    && prev.isDuplicate === next.isDuplicate
    && prev.duplicateOfIndex === next.duplicateOfIndex
    && prev.substatColors === next.substatColors
    && prev.metasets === next.metasets
}

export default memo(ConfigChip, areConfigChipPropsEqual)


function summaryParts(
  cfg: BuilderConfig,
  metasets: Metaset[],
  opts: {
    substatColors: Record<number, { fg: string; bg: string }>
    useStatButtonColors: boolean
    showFactionIcons: boolean
    showSetIcons: boolean
    t?: (key: string, params?: Record<string, string | number>) => string
  }
): JSX.Element | null {
  const parts: Array<JSX.Element> = []
  const addText = (text: string) => { if (text) parts.push(<Box key={`t-${parts.length}`} component="span">{text}</Box>) }
  const addNode = (node: JSX.Element) => parts.push(<Box key={`n-${parts.length}`} component="span">{node}</Box>)

  // Rank + Rarity (combined). Insert a non‑breaking space between them to avoid orphaned rarity.
  {
    // Localized rank label using existing star keys
    const chipRankLabel = (code?: number): string => {
      const n = Number(code ?? 0)
      if (n === 0) return ''
      const tr = opts.t
      const star = (s: number): string => {
        if (!tr) return `${s}★`
        switch (s) {
          case 1: return tr('star1')
          case 2: return tr('star2')
          case 3: return tr('star3')
          case 4: return tr('star4')
          case 5: return tr('star5')
          case 6: return tr('star6')
          default: return `${s}★`
        }
      }
      if (n >= 1 && n <= 6) return star(n)
      if (n >= 7 && n <= 11) return `≥${NBSP}${star(n - 6)}`
      if (n >= 12 && n <= 16) return `≤${NBSP}${star(n - 10)}`
      return String(n)
    }

    const rank = chipRankLabel(cfg.rankCode)
    const effectiveRarityCode = (cfg.rarityMode === 'auto') ? resolveAutoRarityCode(cfg) : cfg.rarityCode
    // Localized rarity label using existing rarity keys
    const chipRarityLabel = (code?: number): string => {
      const n = Number(code ?? 0)
      const tr = opts.t
      const name = (id: 'rarityCommon'|'rarityUncommon'|'rarityRare'|'rarityEpic'|'rarityLegendary'|'rarityMythical'): string => tr ? tr(id) : id.replace('rarity', '')
      if (n === 0) return ''
      if (n === 1) return name('rarityCommon')
      if (n === 2) return name('rarityUncommon')
      if (n === 3) return name('rarityRare')
      if (n === 4) return name('rarityEpic')
      if (n === 5) return name('rarityLegendary')
      if (n === 15) return name('rarityMythical')
      if (n === 16) return `≥${NBSP}${name('rarityLegendary')}`
      if (n === 6) return `≥${NBSP}${name('rarityCommon')}`
      if (n === 7) return `≥${NBSP}${name('rarityUncommon')}`
      if (n === 8) return `≥${NBSP}${name('rarityRare')}`
      if (n === 9) return `≥${NBSP}${name('rarityEpic')}`
      if (n === 10) return `≤${NBSP}${name('rarityUncommon')}`
      if (n === 11) return `≤${NBSP}${name('rarityRare')}`
      if (n === 12) return `≤${NBSP}${name('rarityEpic')}`
      if (n === 13) return `≤${NBSP}${name('rarityLegendary')}`
      if (n === 14) return `≤${NBSP}${name('rarityMythical')}`
      return String(n)
    }

    let rarity = chipRarityLabel(effectiveRarityCode)
    // When Rarity=Auto and Keep Mode is Late, the builder expands into
    // multiple rarity branches (≥ Epic base + ≥ Legendary at 4/8/12).
    // Add a subtle indicator after the rarity text to reflect this.
    const isLate = ((cfg.earlyKeepMode ?? 'early') === 'late')
    // Multi-branch when Late+Auto and base is below Legendary: show +
    const multiRarity = (cfg.rarityMode === 'auto') && isLate && (effectiveRarityCode !== 16)
    if (multiRarity) rarity = `${rarity}${NBSP}+`
    const combined = [rank, rarity].filter(Boolean).join(NBSP)
    if (combined) addText(combined)
  }

  // Keep mode indicator: show a compact emoji for timing to make it explicit.
  // 🌅 for Early, 🌙 for Late.
  {
    const mode = (cfg.earlyKeepMode ?? 'early')
    addText(mode === 'late' ? '🌙' : '🌅')
  }

  // Faction
  if (cfg.factionCode && cfg.factionCode !== 0) {
    const tr = opts.t
    const label = tr ? tr(factionI18nKey(cfg.factionCode)) : factionCodeToName(cfg.factionCode)
    if (opts.showFactionIcons) {
      addNode(
        <Box
          component="span"
          title={label}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            verticalAlign: `${CONFIG_CHIP_FACTION_ICON_OFFSET_EM}em`,
          }}
        >
          <FactionIcon faction={cfg.factionCode} size={18} sx={{ mr: 0.25 }} />
        </Box>
      )
    } else {
      addText(label)
    }
  }

  // Slots (artifact types) — render icons used by the Builder for consistency
  // Why: visual parity with Builder; icons are easier to scan than text here.
  {
    const types = (cfg as unknown as { artifactTypes?: number[] }).artifactTypes
    if (types && types.length > 0) {
      const sorted = [...types].sort(compareArtifactTypes)
      const nodes = sorted.map((typeId, i) => {
        const Icon = artifactTypeIconFor(typeId)
        if (Icon) {
          return (
            // Inline icon baseline tends to sit a bit high next to caption text;
            // nudge it down slightly for visual centering in the chip.
            <Box
              key={`slot-${typeId}-${i}`}
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                mr: 0.5,
                verticalAlign: `${CONFIG_CHIP_SLOT_ICON_OFFSET_EM}em`,
              }}
            >
              <Icon fontSize="inherit" />
            </Box>
          )
        }
        // Fallback to text if icon not found (should not happen)
        const tr = opts.t
        return (
          <Box key={`slot-${typeId}-${i}`} component="span" sx={{ mr: 0.5 }}>{tr ? tr(artifactTypeI18nKey(typeId)) : artifactTypeName(typeId)}</Box>
        )
      })
      addNode(<>{nodes}</>)
    }
  }

  // Main stats (colored if enabled) — follows Slots
  {
    const v = ((cfg as unknown as { mainStatsV?: number[] }).mainStatsV ?? []).slice()
    // Preferred stat ordering used across the app (same as substat chips/table)
    v.sort(compareVariants)
    if (v.length > 0) {
      const nodes = v.map((vk, i) => {
        const name = (opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
        const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
        return (
          <Box key={`m-${vk}-${i}`} component="span" sx={{ color: opts.useStatButtonColors ? fg : undefined }}>{name}</Box>
        )
      })
      const interleaved: JSX.Element[] = []
      nodes.forEach((n, i) => { interleaved.push(n); if (i < nodes.length - 1) interleaved.push(<Box key={`m-sep-${i}`} component="span">, </Box>) })
      addNode(<>{interleaved}</>)
    }
  }

  // Substats (colored if enabled)
  {
    const sv = ((cfg as unknown as { substatsV?: number[] }).substatsV ?? []).slice()
    // Sort substats by the same preferred order
    sv.sort(compareVariants)
    const fv = (cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV ?? []
    const bounds = (cfg as unknown as { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> }).substatRollBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> | undefined
    if (sv.length > 0) {
      const fixedSet = new Set<number>(fv as number[])
      const nodes = sv.map((vk, i) => {
        const name = (opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
        const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
        // Render per-substat roll bounds using a compact, readable indicator circle
        // like the Builder’s roll badge, but without fill: a red (cap) or green (min/any)
        // outlined circle with the number inside. This avoids the cryptic ">= 4r" text.
        const b = bounds ? bounds[vk] : undefined
        const min = (b && typeof b.min === 'number') ? Math.max(0, Math.min(5, Math.floor(b.min))) : undefined
        const max = (b && typeof b.max === 'number') ? Math.max(0, Math.min(5, Math.floor(b.max))) : undefined
        const showCap = max !== undefined
        const showMin = !showCap && (min !== undefined)

        // Indicator: show only one state. UI enforces mutual exclusivity; if both present (legacy), prefer cap.
        const indicator = (showCap || showMin) ? (
          <Box
            key={`ri-${vk}-${i}`}
            component="span"
            title={(() => {
              const tr = opts.t
              if (showCap) return tr ? tr('chipMaxRolls', { n: String(max ?? '') }) : `Max rolls: ${String(max ?? '')}`
              if (showMin) return tr ? tr('chipMinRolls', { n: String(min ?? '') }) : `Min rolls: ${String(min ?? '')}`
              return ''
            })()}
            sx={{
              ml: 0.5,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: CHIP_ROLL_BADGE_SIZE_PX,
              height: CHIP_ROLL_BADGE_SIZE_PX,
              borderRadius: '50%',
              border: '1.2px solid',
              lineHeight: 1,
              fontSize: CHIP_ROLL_BADGE_FONT_SIZE_PX,
              // No fill per request; ring color indicates intent; number uses a high-contrast white
              bgcolor: 'transparent',
              color: 'common.white',
              borderColor: showCap ? 'error.main' : (showMin ? 'success.main' : 'text.secondary'),
              // Subtle baseline alignment
              position: 'relative',
              top: '0px',
              userSelect: 'none',
            }}
          >
            {showCap ? String(max) : (showMin ? String(min) : '')}
          </Box>
        ) : null

        return (
          <Box key={`s-${vk}-${i}`} component="span" sx={{ color: opts.useStatButtonColors ? fg : undefined }}>
            {name}
            {fixedSet.has(vk as number) ? '🔒' : ''}
            {indicator}
          </Box>
        )
      })
      const interleaved: JSX.Element[] = []
      nodes.forEach((n, i) => { interleaved.push(n); if (i < nodes.length - 1) interleaved.push(<Box key={`s-sep-${i}`} component="span">, </Box>) })
      addNode(<><Box component="span">{`${(opts.t ? opts.t('chipSubs') : 'Subs')}:${NBSP}`}</Box>{interleaved}</>)
    } else {
      const tr = opts.t
      addText(`${tr ? tr('chipSubs') : 'Subs'}:${NBSP}${tr ? tr('any') : 'Any'}`)
    }
  }

  // Required Substats count (show only when > 0)
  if ((cfg.minCount ?? 0) > 0) {
    const base = opts.t ? opts.t('chipReq') : 'Req'
    const label = cfg.autoSubstatFlex ? `${base}★` : base
    addText(`${label}:${NBSP}${cfg.minCount}`)
  }

  // Min required rolls (aggregate across selected; show only when > 0)
  if ((cfg.minRequiredRolls ?? 0) > 0) {
    // Compact math-like notation to indicate total roll requirement.
    // Show a lock when the aggregate target applies only to locked substats.
    const lockedScope = (cfg.substatMinTarget === 'locked')
    addText(`Σr${NBSP}≥${NBSP}${cfg.minRequiredRolls}${lockedScope ? `${NBSP}🔒` : ''}`)
  }

  // Sets (icons when enabled) — render metasets as text and artifacts with icons respecting the preference toggle
  {
    const setIdsSorted = (cfg.artifactSets ?? []).slice().sort((a, b) => Number(a) - Number(b))
    const metaEntries = (cfg.artifactMetaSets ?? []).map((metaId, idx) => {
      const meta = metasets.find(m => m.id === metaId)
      const iconId = (meta?.iconId ?? DEFAULT_METASET_ICON_ID) as MetasetIconId
      return { key: `${metaId}-${idx}`, name: meta?.name || metaId, iconId }
    })

    if (opts.showSetIcons) {
      const metasetNodes: JSX.Element[] = metaEntries.map((entry) => {
        if (entry.iconId !== DEFAULT_METASET_ICON_ID) {
          const option = metasetIconOptionById(entry.iconId)
          return (
            <Box
              key={`meta-set-${entry.key}-icon`}
              component="span"
              title={entry.name}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                verticalAlign: `${CONFIG_CHIP_SET_ICON_OFFSET_EM}em`,
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              {option.glyph}
            </Box>
          )
        }
        return (
          <Box
            key={`meta-set-${entry.key}-text`}
            component="span"
            sx={{ whiteSpace: 'nowrap' }}
            title={String(entry.name)}
          >
            {String(entry.name)}
          </Box>
        )
      })
      const hasTextualMetaset = metaEntries.some(entry => entry.iconId === DEFAULT_METASET_ICON_ID)
      const iconTranslatePx = hasTextualMetaset ? CONFIG_CHIP_SET_ICON_TRANSLATE_WITH_TEXT_PX : CONFIG_CHIP_SET_ICON_TRANSLATE_Y_PX
      const iconNodes = setIdsSorted.map((id, idx) => {
        const canonicalName = artifactSetName(id)
        const localizedName = opts.t ? opts.t(artifactSetI18nKey(id)) : canonicalName
        return (
          <Box
            key={`set-icon-${id}-${idx}`}
            component="span"
            title={localizedName}
            sx={{ display: 'inline-flex', alignItems: 'center', verticalAlign: `${CONFIG_CHIP_SET_ICON_OFFSET_EM}em` }}
          >
            <SetIcon
              name={canonicalName}
              sx={{
                mr: 0,
                verticalAlign: `${CONFIG_CHIP_SET_ICON_OFFSET_EM}em`,
                transform: `translateY(${iconTranslatePx}px)`,
              }}
            />
          </Box>
        )
      })
      if (metasetNodes.length > 0 || iconNodes.length > 0) {
        addNode(
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.35 }}>
            {metasetNodes}
            {iconNodes}
          </Box>,
        )
      }
    } else {
      const setNames = setIdsSorted.map(id => (opts.t ? opts.t(artifactSetI18nKey(id)) : artifactSetName(id)))
      const setsJoined = [...metaEntries.map(entry => entry.name), ...setNames].join(', ')
      if (setsJoined) {
        addText(setsJoined)
      }
    }
  }

  if (parts.length === 0) return null
  // Interleave with separators
  const withSeps: JSX.Element[] = []
  parts.forEach((p, i) => { withSeps.push(p); if (i < parts.length - 1) withSeps.push(<Box key={`sep-${i}`} component="span"> | </Box>) })
  return <>{withSeps}</>
}
/**
 * ConfigChip
 *
 * Compact, clickable summary for a single BuilderConfig with context menu
 * actions (duplicate, move, copy, delete). Renders the human-readable summary.
 */
