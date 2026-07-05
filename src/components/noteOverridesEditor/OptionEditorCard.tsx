/**
 * OptionEditorCard — one accordion row of the block editor: label/detail localized
 * strings, group kind, default marker, explicit id, constraint token lists, slider
 * params (slider kind only), and the EffectBodyBuilder for the `{ … }` body.
 * Collapsed rows are one line, so a 5-option question stays scannable.
 */
import { useCallback } from 'react'
import type { JSX } from 'react'
import {
  Accordion, AccordionDetails, AccordionSummary, Autocomplete, Box, Button, Checkbox, Chip,
  Divider, FormControlLabel, IconButton, MenuItem, Select, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import CloseIcon from '@mui/icons-material/Close'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import StarIcon from '@mui/icons-material/Star'
import { useI18n } from '../../lib/i18n'
import type { I18nKey } from '../../lib/i18n'
import type { NoteQuestionGroupType, SliderToggleDefault, SliderToggleSide } from '../../lib/noteOverridesParser'
import { SLIDER_TOGGLE_DEFAULT_VALUES, SLIDER_TOGGLE_SIDE_VALUES, normalizeQuestionToken } from '../../lib/noteOverridesParser'
import type { DraftOption, DraftSliderParams, OverridesDomain } from '../../lib/overridesDraftTypes'
import type { Metaset } from '../../lib/metasets'
import { EffectBodyBuilder } from './EffectBodyBuilder'
import { LocalizedStringField } from './LocalizedStringField'
import { OverridesNumberField } from './OverridesNumberField'
import { MONO_INPUT_SX } from './editorStyles'

// Kind dropdown entries: canonical DSL keyword per logical group type.
const KIND_OPTIONS: Array<{ type: NoteQuestionGroupType; labelKey: I18nKey }> = [
  { type: 'single', labelKey: 'noteOverridesEditorKindRadio' },
  { type: 'multi', labelKey: 'noteOverridesEditorKindCheckbox' },
  { type: 'slider', labelKey: 'noteOverridesEditorKindSlider' },
]

// Constraint chip-list descriptors: draft field + its label key.
const CONSTRAINT_FIELDS: Array<{ field: 'setTokens' | 'unsetTokens' | 'excludedTokens' | 'needsTokens' | 'onlyTokens'; labelKey: I18nKey }> = [
  { field: 'setTokens', labelKey: 'noteOverridesEditorConstraintSet' },
  { field: 'unsetTokens', labelKey: 'noteOverridesEditorConstraintUnset' },
  { field: 'excludedTokens', labelKey: 'noteOverridesEditorConstraintExcl' },
  { field: 'needsTokens', labelKey: 'noteOverridesEditorConstraintNeeds' },
  { field: 'onlyTokens', labelKey: 'noteOverridesEditorConstraintOnly' },
]

// Section caption shared by constraints / slider / effects headers (one look everywhere).
const SECTION_CAPTION_SX = { fontWeight: 700, color: 'text.secondary', letterSpacing: 0.2 } as const

export interface OptionEditorCardProps {
  hostDomain: OverridesDomain
  option: DraftOption
  index: number
  count: number
  expanded: boolean
  onToggle: () => void
  onChange: (next: DraftOption) => void
  onRemove: () => void
  onMove: (delta: -1 | 1) => void
  onDuplicate: () => void
  // Known `id=` tokens across the note (constraint reference suggestions).
  knownTokens: string[]
  // Known selector tag values across the note (condition-row suggestions).
  knownTags: string[]
  // App metasets + user substat colors, forwarded to the body builder's value controls.
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
}

// Normalize freeSolo chip entries to valid tokens; invalid entries are dropped.
const normalizeTokens = (values: string[]): string[] => (
  values.map((value) => normalizeQuestionToken(value)).filter((value): value is string => value !== null)
)

export function OptionEditorCard({
  hostDomain, option, index, count, expanded, onToggle, onChange, onRemove, onMove, onDuplicate, knownTokens, knownTags, metasets, substatColors,
}: OptionEditorCardProps): JSX.Element {
  const { t } = useI18n()
  const patch = useCallback((partial: Partial<DraftOption>) => onChange({ ...option, ...partial }), [onChange, option])
  // Kind switch: entering slider kind materializes params; leaving keeps them inert.
  const setKind = useCallback((groupType: NoteQuestionGroupType) => {
    const sliderParams: DraftSliderParams | null = groupType === 'slider'
      ? (option.sliderParams ?? { min: 0, max: 10, step: 1, default: 1, unit: null, toggle: null, marks: [] })
      : option.sliderParams
    patch({ groupType, sliderParams })
  }, [option.sliderParams, patch])
  const patchSlider = useCallback((partial: Partial<DraftSliderParams>) => {
    if (!option.sliderParams) return
    patch({ sliderParams: { ...option.sliderParams, ...partial } })
  }, [option.sliderParams, patch])

  const summaryLabel = option.label.base.trim() || t('noteOverridesEditorOptionsHeader')
  return (
    <Accordion expanded={expanded} onChange={onToggle} disableGutters data-testid={`overrides-editor-option-${index}`}>
      <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0 }}>
          {option.isDefault && <StarIcon sx={{ fontSize: '0.9rem', color: 'warning.main' }} />}
          <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {summaryLabel}
          </Typography>
          <Chip size="small" variant="outlined" label={t(KIND_OPTIONS.find((k) => k.type === option.groupType)!.labelKey)} sx={{ height: 18, fontSize: '0.65rem' }} />
          {/* Row tools: reorder / duplicate / remove. stopPropagation keeps the accordion put. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, borderLeft: '1px solid', borderColor: 'divider', pl: 0.75, ml: 0.25 }}>
            <Tooltip title={t('noteOverridesEditorMoveUp')}>
              <span>
                <IconButton size="small" disabled={index === 0} onClick={(e) => { e.stopPropagation(); onMove(-1) }} aria-label={t('noteOverridesEditorMoveUp')}>
                  <ArrowUpwardIcon sx={{ fontSize: '0.85rem' }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('noteOverridesEditorMoveDown')}>
              <span>
                <IconButton size="small" disabled={index >= count - 1} onClick={(e) => { e.stopPropagation(); onMove(1) }} aria-label={t('noteOverridesEditorMoveDown')}>
                  <ArrowDownwardIcon sx={{ fontSize: '0.85rem' }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('noteOverridesEditorDuplicateOption')}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDuplicate() }} aria-label={t('noteOverridesEditorDuplicateOption')}>
                <ContentCopyIcon sx={{ fontSize: '0.85rem' }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('noteOverridesEditorRemoveOption')}>
              <span>
                <IconButton size="small" disabled={count <= 1} onClick={(e) => { e.stopPropagation(); onRemove() }} aria-label={t('noteOverridesEditorRemoveOption')}>
                  <CloseIcon sx={{ fontSize: '0.85rem' }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Kind, default marker, and explicit id on one aligned control row. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Select value={option.groupType} onChange={(event) => setKind(event.target.value as NoteQuestionGroupType)} size="small" aria-label={t('noteOverridesEditorKindLabel')}>
            {KIND_OPTIONS.map((kind) => (
              <MenuItem key={kind.type} value={kind.type}>{t(kind.labelKey)}</MenuItem>
            ))}
          </Select>
          <FormControlLabel
            sx={{ mr: 0 }}
            control={<Checkbox size="small" checked={option.isDefault} onChange={(event) => patch({ isDefault: event.target.checked })} />}
            label={<Typography variant="body2">{t('noteOverridesEditorDefaultToggle')}</Typography>}
          />
          {/* Helper lives in the tooltip so the row keeps one clean baseline. */}
          <Tooltip title={t('noteOverridesEditorIdHelper')}>
            <TextField
              label={t('noteOverridesEditorIdField')}
              value={option.explicitId ?? ''}
              onChange={(event) => patch({ explicitId: event.target.value.trim() ? event.target.value.trim().toLowerCase() : null })}
              size="small"
              sx={{ width: 200, ...MONO_INPUT_SX }}
            />
          </Tooltip>
        </Box>
        {/* Localized label + optional detail (second column / description line). */}
        <LocalizedStringField label={t('noteOverridesEditorLabelField')} value={option.label} onChange={(label) => patch({ label })} testId={`overrides-editor-option-${index}-label`} />
        {option.detail ? (
          <LocalizedStringField
            label={t('noteOverridesEditorDetailField')}
            value={option.detail}
            onChange={(detail) => patch({ detail })}
            onRemove={() => patch({ detail: null })}
            multiline
            testId={`overrides-editor-option-${index}-detail`}
          />
        ) : (
          <Box>
            <Button size="small" variant="text" startIcon={<AddIcon fontSize="small" />} onClick={() => patch({ detail: { base: '', locales: [] } })}>
              {t('noteOverridesEditorAddDetail')}
            </Button>
          </Box>
        )}
        <Divider flexItem />
        {option.groupType === 'slider' && option.sliderParams ? (
          // ── Slider params (numbers, unit, toggle, marks) ─────────────────────
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Typography variant="caption" sx={SECTION_CAPTION_SX}>{t('noteOverridesEditorSliderHeader')}</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {(['min', 'max', 'step', 'default'] as const).map((key) => (
                <OverridesNumberField
                  key={key}
                  label={key}
                  value={option.sliderParams![key]}
                  onChange={(next) => patchSlider({ [key]: next })}
                  width={96}
                  testId={`overrides-editor-option-${index}-slider-${key}`}
                />
              ))}
            </Box>
            {option.sliderParams.unit ? (
              <LocalizedStringField
                label={t('noteOverridesEditorSliderUnit')}
                value={option.sliderParams.unit}
                onChange={(unit) => patchSlider({ unit })}
                onRemove={() => patchSlider({ unit: null })}
              />
            ) : null}
            {option.sliderParams.toggle ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 1.25, borderLeft: '2px solid', borderColor: 'divider' }}>
                <LocalizedStringField
                  label={t('noteOverridesEditorSliderToggleLabel')}
                  value={option.sliderParams.toggle.label}
                  onChange={(label) => patchSlider({ toggle: { ...option.sliderParams!.toggle!, label } })}
                  onRemove={() => patchSlider({ toggle: null })}
                />
                {/* Enum params as labeled toggle-button pairs — no DSL spellings in the UI. */}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('noteOverridesEditorSliderToggleSide')}</Typography>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={option.sliderParams.toggle.side}
                      onChange={(_, side: SliderToggleSide | null) => { if (side) patchSlider({ toggle: { ...option.sliderParams!.toggle!, side } }) }}
                    >
                      {SLIDER_TOGGLE_SIDE_VALUES.map((side) => (
                        <ToggleButton key={side} value={side} sx={{ px: 1, py: 0.25, textTransform: 'none' }}>{side}</ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('noteOverridesEditorSliderToggleDefault')}</Typography>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={option.sliderParams.toggle.default}
                      onChange={(_, state: SliderToggleDefault | null) => { if (state) patchSlider({ toggle: { ...option.sliderParams!.toggle!, default: state } }) }}
                    >
                      {SLIDER_TOGGLE_DEFAULT_VALUES.map((state) => (
                        <ToggleButton key={state} value={state} sx={{ px: 1, py: 0.25, textTransform: 'none' }}>{state}</ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>
                </Box>
              </Box>
            ) : null}
            {/* Marks: value + localized label rows under one caption. */}
            {option.sliderParams.marks.length > 0 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('noteOverridesEditorSliderMarks')}</Typography>
            )}
            {option.sliderParams.marks.map((mark, markIndex) => (
              // Marks are positional (values may collide while typing) — slot identity.
              // eslint-disable-next-line @eslint-react/no-array-index-key
              <Box key={markIndex} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pl: 1.25 }}>
                <OverridesNumberField
                  value={mark.value}
                  onChange={(next) => patchSlider({ marks: option.sliderParams!.marks.map((m, i) => (i === markIndex ? { ...m, value: next } : m)) })}
                  ariaLabel={t('noteOverridesEditorSliderMarks')}
                  width={88}
                />
                <Box sx={{ flex: 1 }}>
                  <LocalizedStringField
                    label={t('noteOverridesEditorSliderMarksHelper')}
                    value={mark.label}
                    onChange={(label) => patchSlider({ marks: option.sliderParams!.marks.map((m, i) => (i === markIndex ? { ...m, label } : m)) })}
                    onRemove={() => patchSlider({ marks: option.sliderParams!.marks.filter((_, i) => i !== markIndex) })}
                  />
                </Box>
              </Box>
            ))}
            {/* Add-affordances for the optional slider extras, on one compact row. */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {!option.sliderParams.unit && (
                <Button size="small" variant="text" startIcon={<AddIcon fontSize="small" />} onClick={() => patchSlider({ unit: { base: '', locales: [] } })}>
                  {t('noteOverridesEditorSliderUnit')}
                </Button>
              )}
              {!option.sliderParams.toggle && (
                <Button
                  size="small"
                  variant="text"
                  startIcon={<AddIcon fontSize="small" />}
                  onClick={() => patchSlider({ toggle: { label: { base: '', locales: [] }, side: 'above', default: 'on' } })}
                >
                  {t('noteOverridesEditorSliderToggleLabel')}
                </Button>
              )}
              <Button
                size="small"
                variant="text"
                startIcon={<AddIcon fontSize="small" />}
                onClick={() => patchSlider({ marks: [...option.sliderParams!.marks, { value: option.sliderParams!.min, label: { base: '', locales: [] }, subtext: null }] })}
              >
                {t('noteOverridesEditorSliderMarks')}
              </Button>
            </Box>
          </Box>
        ) : (
          // ── Constraint token lists (non-slider kinds) ────────────────────────
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Typography variant="caption" sx={SECTION_CAPTION_SX}>{t('noteOverridesEditorConstraintsHeader')}</Typography>
            {/* alignItems start keeps short fields from stretching to the tallest chip box. */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 1, alignItems: 'start' }}>
              {CONSTRAINT_FIELDS.map(({ field, labelKey }) => (
                <Autocomplete
                  key={field}
                  multiple
                  freeSolo
                  size="small"
                  options={knownTokens}
                  value={option[field]}
                  onChange={(_, values) => patch({ [field]: normalizeTokens(values) })}
                  renderInput={(params) => <TextField {...params} label={t(labelKey)} size="small" />}
                  slotProps={{ chip: { size: 'small', sx: { fontFamily: 'monospace', fontSize: '0.7rem' } } }}
                />
              ))}
              {/* needs=on|off forced display state — labeled select matching the outlined fields. */}
              <TextField
                select
                label={t('noteOverridesEditorConstraintNeedsState')}
                value={option.needsDisabledState ?? ''}
                onChange={(event) => {
                  // The empty item encodes "no forced state" (null in the draft).
                  const value = event.target.value as '' | 'on' | 'off'
                  patch({ needsDisabledState: value === '' ? null : value })
                }}
                size="small"
              >
                <MenuItem value="">—</MenuItem>
                <MenuItem value="on">needs=on</MenuItem>
                <MenuItem value="off">needs=off</MenuItem>
              </TextField>
            </Box>
            {/* setval token=value rows: force a slider while this option is selected. */}
            {option.setValueDirectives.length > 0 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('noteOverridesEditorConstraintSetval')}</Typography>
            )}
            {option.setValueDirectives.map((directive, dirIndex) => (
              // Directives are positional rows (tokens may repeat while editing).
              // eslint-disable-next-line @eslint-react/no-array-index-key
              <Box key={dirIndex} sx={{ display: 'flex', gap: 1, alignItems: 'center', pl: 1.25 }}>
                <Autocomplete
                  freeSolo
                  size="small"
                  options={knownTokens}
                  value={directive.token}
                  onInputChange={(_, token) => {
                    const normalized = normalizeQuestionToken(token)
                    if (normalized === null) return
                    patch({ setValueDirectives: option.setValueDirectives.map((d, i) => (i === dirIndex ? { ...d, token: normalized } : d)) })
                  }}
                  sx={{ width: 240 }}
                  renderInput={(params) => <TextField {...params} size="small" placeholder="id" sx={MONO_INPUT_SX} />}
                />
                <OverridesNumberField
                  value={directive.value}
                  onChange={(next) => patch({ setValueDirectives: option.setValueDirectives.map((d, i) => (i === dirIndex ? { ...d, value: next } : d)) })}
                  ariaLabel={t('noteOverridesEditorConstraintSetval')}
                  width={96}
                />
                <IconButton
                  size="small"
                  onClick={() => patch({ setValueDirectives: option.setValueDirectives.filter((_, i) => i !== dirIndex) })}
                  aria-label={`${t('noteOverridesEditorConstraintSetval')} ×`}
                >
                  <CloseIcon sx={{ fontSize: '0.95rem' }} />
                </IconButton>
              </Box>
            ))}
            <Box>
              <Button
                size="small"
                variant="text"
                startIcon={<AddIcon fontSize="small" />}
                onClick={() => patch({ setValueDirectives: [...option.setValueDirectives, { token: knownTokens[0] ?? 'slider_id', value: 0 }] })}
              >
                {t('noteOverridesEditorConstraintSetval')}
              </Button>
            </Box>
          </Box>
        )}
        <Divider flexItem />
        {/* Effect body: structured builder or raw DSL fallback. */}
        <EffectBodyBuilder hostDomain={hostDomain} body={option.body} onChange={(body) => patch({ body })} knownTags={knownTags} metasets={metasets} substatColors={substatColors} />
      </AccordionDetails>
    </Accordion>
  )
}
