/**
 * TesterNormalizedPresetEditorMenu
 *
 * Context-menu style editor for a single Rule Tester grid "Normalized" preset.
 * Why: The grid menu uses right-click for advanced actions, and this editor should
 * feel consistent with the existing Sort popout (row selection + weight bump chips).
 */
import React from 'react'
import { Box, Button, Divider, Menu, MenuItem, Typography } from '@mui/material'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import { alpha, useTheme } from '@mui/material/styles'
import ContextMenuPaper from './ContextMenuPaper'
import ContextMenuTitle from './ContextMenuTitle'
import { useI18n } from '../lib/i18n'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, STAT_VARIANTS_PRIORITY, type StatVariant, statVariantI18nKey } from '../lib/types'
import {
  TESTER_SORT_WEIGHT_DEFAULT,
} from '../lib/testerSort'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import type { TesterGridNormalizedPreset, TesterGridNormalizedPresetId } from '../state/testerGridNormalizedOverlayPreferences'
import { TesterSortWeightControls } from './TesterSortWeightControls'

export type TesterNormalizedPresetEditorMenuProps = {
  open: boolean
  anchorPosition: { x: number; y: number } | null
  presetId: TesterGridNormalizedPresetId
  preset: TesterGridNormalizedPreset
  onClose: () => void
  // Color-stats inputs mirror the main tester grid setting so labels stay consistent.
  useStatButtonColors: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  onToggleVariant: (presetId: TesterGridNormalizedPresetId, variant: StatVariant) => void
  onBumpWeight: (presetId: TesterGridNormalizedPresetId, variant: StatVariant, deltaSteps: number) => void
  onSetWeight: (presetId: TesterGridNormalizedPresetId, variant: StatVariant, next: number) => void
  onResetPreset: (presetId: TesterGridNormalizedPresetId) => void
  // Optional paper ref allows parent menus to treat this menu as "inside" for outside-click logic.
  paperRef?: React.RefObject<HTMLDivElement | null>
}

const formatWeight = (value: number): string => {
  // Weight values are normalized to 2 decimals (0.05 steps); keep display stable.
  const safe = Number.isFinite(value) ? value : TESTER_SORT_WEIGHT_DEFAULT
  return `×${safe.toFixed(2)}`
}

export function TesterNormalizedPresetEditorMenu({
  open,
  anchorPosition,
  presetId,
  preset,
  onClose,
  useStatButtonColors,
  substatColors,
  onToggleVariant,
  onBumpWeight,
  onSetWeight,
  onResetPreset,
  paperRef: paperRefProp,
}: TesterNormalizedPresetEditorMenuProps) {
  const { t } = useI18n()
  const theme = useTheme()
  // Reuse a parent-provided ref when nesting under another context menu.
  const localPaperRef = React.useRef<HTMLDivElement | null>(null)
  const paperRef = paperRefProp ?? localPaperRef

  // Close-on-outside-right-click keeps the custom menu stack consistent with the rest of the app.
  useContextMenuCloseOnOutsideRightClick({
    open,
    onClose,
    menuRef: paperRef,
  })

  const weights = preset.weights ?? {}
  const selectedSet = React.useMemo(() => new Set<number>((preset.variants ?? []).map((variant) => Number(variant))), [preset.variants])

  const title = t('testerGridNormalizedPresetTitle', { n: presetId + 1 })

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      {...(anchorPosition ? { anchorPosition: { top: anchorPosition.y, left: anchorPosition.x } } : {})}
      MenuListProps={{ disablePadding: true }}
      slotProps={{
        paper: {
          component: ContextMenuPaper,
          onRequestClose: onClose,
          closeLabel: t('close'),
          ref: paperRef,
          sx: { width: 340, maxWidth: 'calc(100vw - 32px)', px: 0, py: 0 },
        } as unknown as MuiPaperProps,
      }}
    >
      <Box sx={{ px: 2.25, pt: 2.25, pb: 1 }}>
        <ContextMenuTitle title={title} description={t('testerGridNormalizedPresetHelp')} />
      </Box>
      {STAT_VARIANTS_PRIORITY.map((variant) => {
        // Selection is the SSOT: if the stat is not selected, it is not counted (no 0-weight sentinel).
        const selected = selectedSet.has(Number(variant))
        const rawWeight = Number(weights?.[variant] ?? TESTER_SORT_WEIGHT_DEFAULT)
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
              ...(selected ? { backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.14 : 0.08) } : {}),
              '&:hover': {
                backgroundColor: selected
                  ? alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.2 : 0.12)
                  : alpha(theme.palette.action.hover, theme.palette.mode === 'dark' ? 0.6 : 1),
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
              sx={{
                flex: 1,
                minWidth: 0,
                // Match Sort popout: rely on color/row highlight more than heavy font weight.
                fontWeight: theme.typography.fontWeightMedium ?? 600,
                color: fg ?? (selected ? theme.palette.success.main : theme.palette.text.primary),
                opacity: selected ? 1 : (useStatButtonColors ? 0.72 : 0.9),
              }}
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
                  <TesterSortWeightControls
                    label={statLabel}
                    enabled={weightControlsEnabled}
                    weight={rawWeight}
                    onBump={(deltaSteps) => onBumpWeight(presetId, variant, deltaSteps)}
                    onReset={() => onSetWeight(presetId, variant, TESTER_SORT_WEIGHT_DEFAULT)}
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
                    border: `1px solid ${alpha(theme.palette.text.secondary, theme.palette.mode === 'dark' ? 0.22 : 0.14)}`,
                    backgroundColor: 'transparent',
                    color: theme.palette.text.secondary,
                    fontSize: theme.typography.pxToRem(13),
                    fontWeight: 800,
                    letterSpacing: 0.1,
                    fontVariantNumeric: 'tabular-nums',
                    userSelect: 'none',
                    opacity: 0.65,
                  })}
                >
                  {formatWeight(TESTER_SORT_WEIGHT_DEFAULT)}
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
        <Button
          size="small"
          variant="contained"
          color="warning"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onResetPreset(presetId)
          }}
          sx={{ minWidth: 180, fontWeight: 700 }}
        >
          {t('testerGridNormalizedPresetReset')}
        </Button>
      </MenuItem>
    </Menu>
  )
}
