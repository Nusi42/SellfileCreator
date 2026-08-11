import React from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Slider, Stack, Typography } from '@mui/material'
import { useColorScheme, useTheme } from '@mui/material/styles'
import { useI18n } from '../../lib/i18n'
import { labelOfVariant, ANOMALOUS_SUBSTAT_VARIANTS, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT, STAT_VARIANTS_PRIORITY, rarityRankValueI18nKey } from '../../lib/types'
import type { SlotTints } from '../../lib/slotTints'
import type { RarityColors } from '../../lib/rarityColors'
import { type ColorScope, COLOR_SCOPES } from '../../lib/colorScope'
import ColorField from '../ColorField'
import { CycleButton } from '../CycleButton'
import { resolveSubstatChipPalette } from '../RuleSubstatChips'
import { parseHexWithAlpha, formatHexWithAlpha } from '../../lib/colorUtils'
import { MENU_CONTROL_HEIGHT_PX, MENU_CONTROL_MIN_WIDTH_PX } from '../../lib/constants'
import { appZoomCompensatedLength } from '../../lib/sideBySideZoom'

// Parse with a fallback color, then a hardcoded light-blue default — wraps the SSOT
// parseHexWithAlpha (which returns null on bad input) with this dialog's fallback policy.
function parseHexWithAlphaOr(color: string, fallback: string): { base: string; alpha: number } {
  return parseHexWithAlpha(color) ?? parseHexWithAlpha(fallback) ?? { base: '#E3F2FD', alpha: 1 }
}

export default function ManageColorsDialog(props: {
  open: boolean
  onClose: () => void
  substatColors: Record<number, { fg: string; bg: string }>
  setSubstatColors: React.Dispatch<React.SetStateAction<Record<number, { fg: string; bg: string }>>>
  // Slot glyph tints (artifact/accessory) — single fg colour each, edited at the bottom of the flyout.
  slotTints: SlotTints
  setSlotTints: React.Dispatch<React.SetStateAction<SlotTints>>
  // Rarity palette (rarity 1–6) — single fg colour each; one palette feeds labels AND borders/charts.
  rarityColors: RarityColors
  setRarityColors: React.Dispatch<React.SetStateAction<RarityColors>>
  // Per-group colour scope (off / labels / everything) — a CycleButton at the top of each section.
  statColorScope: ColorScope
  setStatColorScope: (next: ColorScope) => void
  rarityColorScope: ColorScope
  setRarityColorScope: (next: ColorScope) => void
  slotColorScope: ColorScope
  setSlotColorScope: (next: ColorScope) => void
  onReset: () => void
}) {
  const {
    open, onClose, substatColors, setSubstatColors, slotTints, setSlotTints, rarityColors, setRarityColors,
    statColorScope, setStatColorScope, rarityColorScope, setRarityColorScope, slotColorScope, setSlotColorScope, onReset,
  } = props
  const { t } = useI18n()
  // Theme + runtime scheme so the preview chip can mirror the real Sellfile-preview chip exactly
  // (resolveSubstatChipPalette adapts fg/bg to the actual rendered surface per scheme).
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  const isLight = colorScheme === 'light'
  // CycleButton options (Off / Labels / Everything) — order from the COLOR_SCOPES SSOT.
  const scopeOptions = React.useMemo(() => COLOR_SCOPES.map((s) => ({
    value: s,
    label: s === 'off' ? t('colorScopeOff')
      : s === 'controls' ? t('colorScopeControls')
        : s === 'text' ? t('colorScopeText')
          : t('colorScopeEverything'),
  })), [t])
  // A "Coloring: [Off|Labels|Everything]" row placed at the top of each colour section.
  // Same 150px label column as the colour rows so the cycle button left-aligns under the Text buttons.
  const renderScopeRow = (scope: ColorScope, setScope: (next: ColorScope) => void) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 1.25, mb: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 136 }}>{t('colorScopeRowLabel')}</Typography>
      {/* CycleButton is intrinsically zero-sized (absolutely-positioned children) — give it an
          explicit min-width/height so the label strip is visible, mirroring MenuCycleRow.
          justifySelf:start keeps it left-aligned in the column instead of stretching. */}
      <CycleButton
        options={scopeOptions}
        value={scope}
        onChange={(v) => setScope(v as ColorScope)}
        sx={{ justifySelf: 'start', minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX }}
      />
    </Box>
  )
  // draftAlphas: slider alpha dragged but not yet committed — same pattern as MUI Slider.
  const [draftAlphas, setDraftAlphas] = React.useState<Record<number, number>>({})
  // draftColors: color picker dragged but not yet committed — mirrors draftAlphas for colors.
  const [draftColors, setDraftColors] = React.useState<Record<number, { fg?: string; bg?: string }>>({})

  // Reset all draft state when dialog closes — render-time state adjustment pattern.
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setDraftAlphas({})
      setDraftColors({})
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      // maxWidth is viewport-relative; the paper carries theme `zoom: var(--app-zoom)` (portaled
      // outside #root) so a raw calc(100vw …) would shrink under forced side-by-side zoom. Compensate
      // it so the cap stays at the intended viewport width at any zoom (no-op when --app-zoom is unset).
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 640 }, maxWidth: appZoomCompensatedLength('calc(100vw - 32px)') } } }}
    >
      <DialogTitle>{t('titleSubstatChipColors')}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('msgChooseColors')}</Typography>
        {/* Substat (stat-name) colouring scope. */}
        {renderScopeRow(statColorScope, setStatColorScope)}
        <Stack spacing={1.25}>
          {/* Classic substats plus the accessory-only ones. */}
          {[...STAT_VARIANTS_PRIORITY, ...ANOMALOUS_SUBSTAT_VARIANTS].map((vk) => {
            const defaultFg = (DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? '#90CAF9') as string
            const defaultBg = (DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[vk] ?? '#E3F2FD') as string
            const fg = (substatColors[vk]?.fg ?? defaultFg) as string
            const bg = (substatColors[vk]?.bg ?? defaultBg) as string

            // Live fg from color picker drag; falls back to committed value.
            const liveFg = draftColors[vk]?.fg ?? fg

            // Live bg from color picker drag (full hex); falls back to committed value.
            const liveBgHex = draftColors[vk]?.bg ?? bg
            const { base: baseBg, alpha: alphaValue } = parseHexWithAlphaOr(liveBgHex, defaultBg)
            const storedPct = Math.round(alphaValue * 100)
            const sliderPct = draftAlphas[vk] ?? storedPct
            const clampedPct = Math.max(0, Math.min(100, sliderPct))
            const sliderAlpha = clampedPct / 100
            // During bg picker drag use the raw draft color; otherwise apply slider alpha.
            const displayHex = draftColors[vk]?.bg ?? formatHexWithAlpha(baseBg, sliderAlpha)
            // Preview chip mirrors the real Sellfile-preview chip: resolve fg/bg/border through the
            // SAME palette function (light-mode fg-tint branch, contrast-adapted label) so the dialog
            // and the table agree in every theme. Feed the LIVE fg/bg as this variant's colours.
            const previewPalette = resolveSubstatChipPalette(theme, {
              variant: vk,
              substatColors: { [vk]: { fg: liveFg, bg: displayHex } },
              colorize: true,
              isLight,
            })
            const previewBg = previewPalette.chipBg
            const previewBorder = previewPalette.chipBorder
            const previewLabelColor = previewPalette.labelColor

            // Fg color picker: onChange → draft, onChangeCommitted → setSubstatColors.
            const handleTextColorChange = (nextFg: string) => {
              setDraftColors(prev => ({ ...prev, [vk]: { ...prev[vk], fg: nextFg } }))
            }
            const handleTextColorCommit = (nextFg: string) => {
              setDraftColors(prev => {
                const next = { ...prev[vk] }
                delete next.fg
                return { ...prev, [vk]: next }
              })
              setSubstatColors(prev => ({ ...prev, [vk]: { fg: nextFg, bg: displayHex } }))
            }

            // Bg color picker: onChange → draft, onChangeCommitted → setSubstatColors.
            const handleBgColorChange = (nextColor: string) => {
              setDraftColors(prev => ({ ...prev, [vk]: { ...prev[vk], bg: nextColor } }))
            }
            const handleBgColorCommit = (nextColor: string) => {
              const parsed = parseHexWithAlphaOr(nextColor, displayHex)
              const hasExplicitAlpha = nextColor.length === 9
              const nextPct = hasExplicitAlpha ? Math.round(parsed.alpha * 100) : clampedPct
              const normalizedPct = Math.max(0, Math.min(100, nextPct))
              const committedHex = formatHexWithAlpha(parsed.base, normalizedPct / 100)
              setDraftColors(prev => {
                const next = { ...prev[vk] }
                delete next.bg
                return { ...prev, [vk]: next }
              })
              setDraftAlphas(prev => {
                const next = { ...prev }
                delete next[vk]
                return next
              })
              setSubstatColors(prev => ({ ...prev, [vk]: { fg: prev[vk]?.fg ?? fg, bg: committedHex } }))
            }

            const handleSliderChange = (_: Event | React.SyntheticEvent, value: number | number[]) => {
              const raw = Array.isArray(value) ? value[0] : value
              if (typeof raw !== 'number') return
              const pct = Math.max(0, Math.min(100, raw))
              setDraftAlphas(prev => (prev[vk] === pct ? prev : { ...prev, [vk]: pct }))
            }

            const handleSliderCommit = (_: Event | React.SyntheticEvent, value: number | number[]) => {
              const raw = Array.isArray(value) ? value[0] : value
              const pct = typeof raw === 'number' ? raw : clampedPct
              const normalized = Math.max(0, Math.min(100, pct))
              const committedHex = formatHexWithAlpha(baseBg, normalized / 100)
              setDraftAlphas(prev => {
                const next = { ...prev }
                delete next[vk]
                return next
              })
              setSubstatColors(prev => ({ ...prev, [vk]: { fg: prev[vk]?.fg ?? fg, bg: committedHex } }))
            }

            return (
              <Box key={`row-${vk}`} sx={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 1.25 }}>
                <Typography sx={{ minWidth: 136 }}>{labelOfVariant(vk)}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <ColorField
                    value={liveFg}
                    onChange={handleTextColorChange}
                    onChangeCommitted={handleTextColorCommit}
                    label={t('labelText')}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <ColorField
                      value={displayHex}
                      onChange={handleBgColorChange}
                      onChangeCommitted={handleBgColorCommit}
                      label={t('labelBg')}
                      allowAlpha
                    />
                    <Slider
                      value={clampedPct}
                      min={0}
                      max={100}
                      step={5}
                      onChange={handleSliderChange}
                      onChangeCommitted={handleSliderCommit}
                      valueLabelDisplay="auto"
                      sx={{ width: 148, minWidth: 124 }}
                      aria-label={t('labelBg')}
                    />
                  </Box>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      borderRadius: '8px',
                      px: 0.75,
                      py: 0.25,
                      bgcolor: previewBg,
                      border: '1px solid',
                      borderColor: previewBorder,
                      color: previewLabelColor,
                      fontSize: '0.85rem',
                    }}
                  >
                    {labelOfVariant(vk)}
                  </Box>
                </Box>
              </Box>
            )
          })}
        </Stack>
        {/* Slot icon tints — artifact (top 6) and accessory (bottom 3). Single fg colour each: the slot
            SVGs are single-fill, so there is no background/alpha to configure here. */}
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('slotTintsSectionTitle')}</Typography>
          {renderScopeRow(slotColorScope, setSlotColorScope)}
          <Stack spacing={1.25}>
            {([
              { key: 'artifact' as const, label: t('slotTintArtifact') },
              { key: 'accessory' as const, label: t('slotTintAccessory') },
            ]).map(({ key, label }) => (
              <Box key={`slot-tint-${key}`} sx={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 1.25 }}>
                <Typography sx={{ minWidth: 136 }}>{label}</Typography>
                <ColorField
                  value={slotTints[key]}
                  // Slot tints have no live-preview consumer here, so commit on change directly.
                  onChange={(next) => setSlotTints((prev) => ({ ...prev, [key]: next }))}
                  onChangeCommitted={(next) => setSlotTints((prev) => ({ ...prev, [key]: next }))}
                  label={t('labelText')}
                />
              </Box>
            ))}
          </Stack>
        </Box>
        {/* Rarity colours — one editable palette per rarity (1–6). The same colour tints the rarity
            WORD (contrast-adapted) and feeds borders/charts/frames (raw). Single fg colour each. */}
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('rarityColorsSectionTitle')}</Typography>
          {renderScopeRow(rarityColorScope, setRarityColorScope)}
          <Stack spacing={1.25}>
            {([1, 2, 3, 4, 5, 6] as const).map((rank) => (
              <Box key={`rarity-color-${rank}`} sx={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 1.25 }}>
                <Typography sx={{ minWidth: 136 }}>{t(rarityRankValueI18nKey(rank))}</Typography>
                <ColorField
                  value={rarityColors[rank]}
                  // No live-preview consumer here, so commit on change directly (mirror slot tints).
                  onChange={(next) => setRarityColors((prev) => ({ ...prev, [rank]: next }))}
                  onChangeCommitted={(next) => setRarityColors((prev) => ({ ...prev, [rank]: next }))}
                  label={t('labelText')}
                />
              </Box>
            ))}
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button size="small" variant="outlined" color="error" onClick={onReset}>{t('resetToDefaults')}</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
