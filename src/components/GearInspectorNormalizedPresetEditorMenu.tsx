/**
 * GearInspectorNormalizedPresetEditorMenu
 *
 * Context-menu style editor for a single Gear Inspector grid "Normalized" preset.
 * Why: The grid menu uses right-click for advanced actions, and this editor should
 * feel consistent with the existing Sort popout (row selection + weight bump chips).
 */
import React from 'react'
import { Box, Button, Divider, Menu, MenuItem, Select, Typography } from '@mui/material'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import ContextMenuTitle from './ContextMenuTitle'
import { useI18n } from '../lib/i18n'
import { DEFAULT_METASET_ICON_ID, METASET_ICON_OPTIONS, metasetIconOptionById, type MetasetIconId } from '../lib/metasetIcons'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, STAT_VARIANTS_PRIORITY, type StatVariant, statVariantI18nKey } from '../lib/types'
import {
  GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT,
} from '../lib/gearInspectorSort'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import type { GearInspectorGridNormalizedPreset, GearInspectorGridNormalizedPresetId } from '../state/gearInspectorGridNormalizedOverlayPreferences'
import { GearInspectorSortWeightControls } from './GearInspectorSortWeightControls'

export type GearInspectorNormalizedPresetEditorMenuProps = {
  open: boolean
  anchorPosition: { x: number; y: number } | null
  presetId: GearInspectorGridNormalizedPresetId
  preset: GearInspectorGridNormalizedPreset
  onClose: () => void
  // Optional "overwrite from current" action used by the Sort popout (not the Gear Inspector grid context menu).
  onOverwriteFromCurrent?: ((presetId: GearInspectorGridNormalizedPresetId) => void) | undefined
  overwriteFromCurrentLabel?: string | undefined
  overwriteFromCurrentDisabled?: boolean | undefined
  // Optional glyph override shown when the app is in "glyph label" mode.
  onSetIconId: (presetId: GearInspectorGridNormalizedPresetId, iconId: MetasetIconId) => void
  // Color-stats inputs mirror the main Gear Inspector grid setting so labels stay consistent.
  useStatButtonColors: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  onToggleVariant: (presetId: GearInspectorGridNormalizedPresetId, variant: StatVariant) => void
  onBumpWeight: (presetId: GearInspectorGridNormalizedPresetId, variant: StatVariant, deltaSteps: number) => void
  onSetWeight: (presetId: GearInspectorGridNormalizedPresetId, variant: StatVariant, next: number) => void
  onResetPreset: (presetId: GearInspectorGridNormalizedPresetId) => void
  // Optional paper ref allows parent menus to treat this menu as "inside" for outside-click logic.
  paperRef?: React.RefObject<HTMLDivElement | null>
}

const formatInactiveWeight = (): string => {
  // Unselected substats do not participate in scoring; show 0 explicitly so the inclusion semantics are obvious.
  // Note: "x" (ASCII) copies more reliably than "×" when users paste into chat.
  return 'x0.00'
}

export function GearInspectorNormalizedPresetEditorMenu({
  open,
  anchorPosition,
  presetId,
  preset,
  onClose,
  onOverwriteFromCurrent,
  overwriteFromCurrentLabel,
  overwriteFromCurrentDisabled = false,
  onSetIconId,
  useStatButtonColors,
  substatColors,
  onToggleVariant,
  onBumpWeight,
  onSetWeight,
  onResetPreset,
  paperRef: paperRefProp,
}: GearInspectorNormalizedPresetEditorMenuProps) {
  const { t } = useI18n()
  // Reuse a parent-provided ref when nesting under another context menu.
  const localPaperRef = React.useRef<HTMLDivElement | null>(null)
  const paperRef = paperRefProp ?? localPaperRef

  // Close-on-outside-right-click keeps the custom menu stack consistent with the rest of the app.
  const { contextMenuGuard } = useContextMenuPaperGuard({
    open,
    onClose,
    menuRef: paperRef,
  })

  const weights = preset.weights ?? {}
  const selectedSet = React.useMemo(() => new Set<number>((preset.variants ?? []).map((variant) => Number(variant))), [preset.variants])

  const title = t('gearInspectorGridNormalizedPresetTitle', { n: presetId + 1 })

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      {...(anchorPosition ? { anchorPosition: { top: anchorPosition.y, left: anchorPosition.x } } : {})}
      slotProps={{
        list: { disablePadding: true },
        paper: { ...buildContextMenuPaperSlotProps({
          component: ContextMenuPaper,
          contextMenuGuard,
          onRequestClose: onClose,
          closeLabel: t('close'),
          sx: { width: 340, maxWidth: 'calc(100vw - 32px)', px: 0, py: 0 },
        }), ref: paperRef },
      }}
    >
      <Box sx={{ px: 2.25, pt: 2.25, pb: 1 }}>
        <ContextMenuTitle title={title} description={t('gearInspectorGridNormalizedPresetHelp')} />
      </Box>
      <MenuItem
        disableRipple
        // Prevent "click away" closures when the Select menu is open in a portal.
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75 }}
        onClick={(event) => { event.stopPropagation() }}
      >
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
          {t('gearInspectorGridNormalizedPresetGlyphLabel')}
        </Typography>
        <Box
          // Match the substat rows: stable right-column width + centered content for easier scanning.
          sx={{
            width: 128,
            minWidth: 128,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Select
            size="small"
            value={preset.iconId ?? DEFAULT_METASET_ICON_ID}
            aria-label={t('gearInspectorGridNormalizedPresetGlyphPickerAria')}
            // Keep the glyph centered; the default dropdown chevron shifts short glyphs off-center.
            IconComponent={() => null}
            onChange={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const nextIconId = (event.target.value || DEFAULT_METASET_ICON_ID) as MetasetIconId
              onSetIconId(presetId, nextIconId)
            }}
            renderValue={(value) => {
              const iconId = (value || DEFAULT_METASET_ICON_ID) as MetasetIconId
              const opt = metasetIconOptionById(iconId)
              return (
                <Box
                  component="span"
                  sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1, width: '100%' }}
                  aria-hidden
                >
                  {opt.glyph}
                </Box>
              )
            }}
            MenuProps={{
              // Keep the picker inside the preset editor so nested context menus do not treat it as "outside".
              disablePortal: true,
              slotProps: {
                paper: {
                  sx: {
                    maxHeight: 320,
                    minWidth: 88,
                    width: 'auto',
                    '& .MuiList-root': {
                      display: 'grid',
                      gridTemplateColumns: 'repeat(6, 1fr)',
                      gap: 0.5,
                      py: 0.5,
                    },
                  },
                },
              },
            }}
            sx={{
              minWidth: 64,
              width: 64,
              height: 28,
              '& .MuiInputBase-root': {
                height: 28,
                minHeight: 28,
              },
              '& .MuiSelect-select': {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                lineHeight: 1,
                textAlign: 'center',
                px: 1,
                py: 0,
              },
            }}
          >
            {METASET_ICON_OPTIONS.map((option) => (
              <MenuItem
                key={option.id}
                value={option.id}
                aria-label={option.id}
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, px: 0.5, width: 'auto' }}
              >
                <Box component="span" sx={{ fontSize: 20, width: 32, textAlign: 'center' }} aria-hidden>{option.glyph}</Box>
              </MenuItem>
            ))}
          </Select>
        </Box>
      </MenuItem>
      <Divider sx={{ my: 0.5 }} />
      {STAT_VARIANTS_PRIORITY.map((variant) => {
        // Selection is the SSOT: if the stat is not selected, it is not counted (no 0-weight sentinel).
        const selected = selectedSet.has(Number(variant))
        const rawWeight = Number(weights?.[variant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
        const weightControlsEnabled = selected
        const statLabel = t(statVariantI18nKey(variant))
        const fg = useStatButtonColors
          ? (substatColors?.[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant])
          : undefined

        return (
          <MenuItem
            key={`normalized-preset-editor-${presetId}-${variant}`}
            onClick={() => onToggleVariant(presetId, variant)}
            sx={(theme) => ({
              // Selection highlight mirrors the Sort popout so the control feels familiar.
              ...(selected ? { backgroundColor: 'rgba(var(--mui-palette-success-mainChannel) / 0.08)', ...theme.applyStyles('dark', { backgroundColor: 'rgba(var(--mui-palette-success-mainChannel) / 0.14)' }) } : {}),
              '&:hover': {
                backgroundColor: selected
                  // Light: 0.12, dark: 0.20 — mirrors the original alpha(success.main, isDark ? 0.20 : 0.12) logic.
                  ? 'rgba(var(--mui-palette-success-mainChannel) / 0.12)'
                  : (theme.vars?.palette.action.hover ?? theme.palette.action.hover),
                ...( selected ? theme.applyStyles('dark', { backgroundColor: 'rgba(var(--mui-palette-success-mainChannel) / 0.20)' }) : {} ),
              },
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 0.75,
            })}
          >
            <Typography
              variant="body2"
              sx={(muiTheme) => ({
                flex: 1,
                minWidth: 0,
                // Match Sort popout: rely on color/row highlight instead of heavy font weight.
                fontWeight: muiTheme.typography.fontWeightRegular ?? 400,
                // When "Color stats" is enabled, always use the per-stat color (selected or not).
                color: fg ?? muiTheme.palette.text.primary,
                opacity: selected ? 1 : (useStatButtonColors ? 0.72 : 0.9),
              })}
            >
              {statLabel}
            </Typography>
            <Box
              // Keep the control column a stable width so scanning doesn’t jump between rows.
              sx={{
                width: 128,
                minWidth: 128,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
              }}
              onClick={(event) => {
                // Weight controls should never toggle selection.
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              {selected ? (
                <>
                  <GearInspectorSortWeightControls
                    label={statLabel}
                    enabled={weightControlsEnabled}
                    weight={rawWeight}
                    weightPrefix="x"
                    onBump={(deltaSteps) => onBumpWeight(presetId, variant, deltaSteps)}
                    onReset={() => onSetWeight(presetId, variant, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)}
                  />
                </>
              ) : (
                <Box
                  component="span"
                  aria-hidden
                  // Ghost badge keeps the control column visually consistent when a stat is unselected.
                  sx={(theme) => ({
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 22,
                    minWidth: 56,
                    px: 0.75,
                    borderRadius: '999px',
                    boxSizing: 'border-box',
                    border: `1px solid rgba(var(--mui-palette-text-secondaryChannel) / 0.14)`,
                    ...theme.applyStyles('dark', { border: `1px solid rgba(var(--mui-palette-text-secondaryChannel) / 0.22)` }),
                    backgroundColor: 'transparent',
                    color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
                    fontSize: theme.typography.pxToRem(13),
                    fontWeight: 800,
                    letterSpacing: 0.1,
                    fontVariantNumeric: 'tabular-nums',
                    userSelect: 'none',
                    opacity: 0.65,
                  })}
                >
                  {formatInactiveWeight()}
                </Box>
              )}
            </Box>
          </MenuItem>
        )
      })}
      <Divider sx={{ my: 0.5 }} />
      <MenuItem
        disableRipple
        sx={{ justifyContent: 'center', py: 0.75 }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, width: '100%', alignItems: 'center' }}>
          {onOverwriteFromCurrent && overwriteFromCurrentLabel ? (
            <Button
              size="small"
              variant="contained"
              color="success"
              disabled={overwriteFromCurrentDisabled}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (overwriteFromCurrentDisabled) return
                onOverwriteFromCurrent(presetId)
              }}
              sx={{ minWidth: 220, fontWeight: 500 }}
            >
              {overwriteFromCurrentLabel}
            </Button>
          ) : null}
          <Button
            size="small"
            variant="contained"
            color="warning"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onResetPreset(presetId)
            }}
            sx={{ minWidth: 220, fontWeight: 500 }}
          >
            {t('gearInspectorGridNormalizedPresetReset')}
          </Button>
        </Box>
      </MenuItem>
    </Menu>
  )
}
