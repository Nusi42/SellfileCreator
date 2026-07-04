/**
 * NoteOverridesBlockEditorDialog — modal visual editor for ONE note override block
 * (`<!-- recipe-overrides … -->` / `<!-- safeguard-overrides … -->`). Opens over the
 * note dialog (both its floating-Paper and centered-Dialog containers) from the
 * edit-mode preview pencil or the "insert override block" toolbar command.
 *
 * Layered over the data layer: overridesDraft (parse → draft + validation) and
 * overridesSerializer (draft → canonical DSL). Apply hands the parent a whole-block
 * text replacement; the modal backdrop freezes the note draft while open, so the
 * captured span cannot go stale.
 */
import { useCallback, useMemo, useState } from 'react'
import type { JSX } from 'react'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { useI18n } from '../../lib/i18n'
import type { NoteQuestionGroupType } from '../../lib/noteOverridesParser'
import type { DraftOption, OverridesBlockDraft, OverridesDomain } from '../../lib/overridesDraftTypes'
import {
  createDraftOption,
  createEmptyOverridesBlockDraft,
  listOverrideBlocks,
  parseOverridesBlockDraft,
  validateOverridesBlockDraft,
} from '../../lib/overridesDraft'
import { collectKnownSelectorTags } from '../../lib/overridesEditorModel'
import { serializeOverridesBlock } from '../../lib/overridesSerializer'
import { OptionEditorCard } from './OptionEditorCard'
import { LocalizedStringField } from './LocalizedStringField'
import type { Metaset } from '../../lib/metasets'

/** Open request: edit an existing block span, or create a new one at an offset.
 *  `nonce` forces a fresh editor mount per open (same block can be reopened). */
export type NoteOverridesBlockEditorRequest =
  | { mode: 'edit'; nonce: number; from: number; to: number; source: string }
  | { mode: 'create'; nonce: number; insertAt: number }

export interface NoteOverridesBlockEditorDialogProps {
  request: NoteOverridesBlockEditorRequest | null
  // Whole note draft (for cross-question id suggestions and insert framing).
  noteText: string
  // App metasets + user substat colors for the body builder's domain value controls.
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  onApply: (result: { from: number; to: number; text: string }) => void
  onClose: () => void
}

// Structural identity of the English base texts — edits here re-hash question/option
// ids and reset stored answers to defaults, which the info Alert explains.
const baseIdentitySignature = (draft: OverridesBlockDraft): string => (
  draft.kind === 'question'
    ? JSON.stringify([draft.prompt.base, draft.options.map((o) => [o.label.base, o.groupType])])
    : 'spacer'
)

// Deep-clone an option for duplication, dropping the source's React key.
const cloneOption = (option: DraftOption, freshKeyFrom: DraftOption): DraftOption => ({
  ...JSON.parse(JSON.stringify({ ...option, key: '' })) as DraftOption,
  key: freshKeyFrom.key,
})

function EditorContent({ request, noteText, metasets, substatColors, onApply, onClose }: NoteOverridesBlockEditorDialogProps & { request: NoteOverridesBlockEditorRequest }): JSX.Element {
  const { t } = useI18n()
  // Initial draft: parse the block being edited, or start a fresh recipe question.
  const [draft, setDraft] = useState<OverridesBlockDraft>(() => (
    request.mode === 'edit'
      ? (parseOverridesBlockDraft(request.source).draft ?? createEmptyOverridesBlockDraft('recipe'))
      : createEmptyOverridesBlockDraft('recipe')
  ))
  const [initialSignature] = useState(() => baseIdentitySignature(draft))
  const [dirty, setDirty] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(() => (
    // Create mode opens its single option directly for immediate typing.
    request.mode === 'create' && draft.kind === 'question' ? draft.options[0]?.key ?? null : null
  ))
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const update = useCallback((next: OverridesBlockDraft) => {
    setDraft(next)
    setDirty(true)
  }, [])

  // Known explicit `id=` tokens across the whole note — constraint suggestions.
  const knownTokens = useMemo(() => {
    const tokens = new Set<string>()
    for (const ref of listOverrideBlocks(noteText)) {
      const parsed = parseOverridesBlockDraft(ref.raw).draft
      if (parsed?.kind !== 'question') continue
      for (const option of parsed.options) if (option.explicitId) tokens.add(option.explicitId)
    }
    return Array.from(tokens).sort()
  }, [noteText])

  // Known selector tag values across the note — condition-row suggestions.
  const knownTags = useMemo(() => collectKnownSelectorTags(noteText), [noteText])

  // Live pre-apply validation (serialize + re-parse round included).
  const problems = useMemo(() => validateOverridesBlockDraft(draft), [draft])
  const answersReset = baseIdentitySignature(draft) !== initialSignature && request.mode === 'edit'

  const updateOption = useCallback((key: string, next: DraftOption) => {
    if (draft.kind !== 'question') return
    let options = draft.options.map((option) => (option.key === key ? next : option))
    // Radio semantics: at most one default among the single-kind options.
    if (next.groupType === 'single' && next.isDefault) {
      options = options.map((option) => (
        option.key !== key && option.groupType === 'single' && option.isDefault
          ? { ...option, isDefault: false }
          : option))
    }
    update({ ...draft, options })
  }, [draft, update])

  const addOption = useCallback((groupType: NoteQuestionGroupType) => {
    if (draft.kind !== 'question') return
    const option = createDraftOption(groupType)
    update({ ...draft, options: [...draft.options, option] })
    setExpandedKey(option.key)
  }, [draft, update])

  const removeOption = useCallback((key: string) => {
    if (draft.kind !== 'question') return
    update({ ...draft, options: draft.options.filter((option) => option.key !== key) })
  }, [draft, update])

  const moveOption = useCallback((key: string, delta: -1 | 1) => {
    if (draft.kind !== 'question') return
    const index = draft.options.findIndex((option) => option.key === key)
    const target = index + delta
    if (index < 0 || target < 0 || target >= draft.options.length) return
    const options = [...draft.options]
    const [moved] = options.splice(index, 1)
    options.splice(target, 0, moved!)
    update({ ...draft, options })
  }, [draft, update])

  const duplicateOption = useCallback((key: string) => {
    if (draft.kind !== 'question') return
    const index = draft.options.findIndex((option) => option.key === key)
    const source = draft.options[index]
    if (!source) return
    // Fresh key + no default/id: ids must stay unique and defaults meaningful.
    const fresh = createDraftOption(source.groupType)
    const copy = { ...cloneOption(source, fresh), isDefault: false, explicitId: null }
    const options = [...draft.options]
    options.splice(index + 1, 0, copy)
    update({ ...draft, options })
    setExpandedKey(copy.key)
  }, [draft, update])

  // Create mode only: switching the block family restarts with a fresh draft.
  const setDomain = useCallback((domain: OverridesDomain) => {
    update(createEmptyOverridesBlockDraft(domain))
  }, [update])

  const handleApply = useCallback(() => {
    const text = serializeOverridesBlock(draft)
    if (request.mode === 'edit') {
      onApply({ from: request.from, to: request.to, text })
      return
    }
    // Create: frame with newlines so the block starts and ends on its own lines.
    const at = request.insertAt
    const before = at > 0 && noteText[at - 1] !== '\n' ? '\n' : ''
    const after = noteText[at] === '\n' || at >= noteText.length ? '\n' : '\n\n'
    onApply({ from: at, to: at, text: `${before}${text}${after}` })
  }, [draft, noteText, onApply, request])

  const requestClose = useCallback(() => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }, [dirty, onClose])

  return (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 3 }}>
        <Typography component="span" variant="h6" sx={{ flex: 1, minWidth: 0 }}>
          {request.mode === 'edit' ? t('noteOverridesEditorTitleEdit') : t('noteOverridesEditorTitleCreate')}
        </Typography>
        {request.mode === 'create' ? (
          <ToggleButtonGroup
            value={draft.domain}
            exclusive
            size="small"
            onChange={(_, value: OverridesDomain | null) => { if (value) setDomain(value) }}
          >
            <ToggleButton value="recipe">{t('noteOverridesEditorKindRecipe')}</ToggleButton>
            <ToggleButton value="safeguard">{t('noteOverridesEditorKindSafeguard')}</ToggleButton>
          </ToggleButtonGroup>
        ) : (
          <Chip size="small" label={draft.domain === 'recipe' ? t('noteOverridesEditorKindRecipe') : t('noteOverridesEditorKindSafeguard')} />
        )}
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {draft.kind === 'question' ? (
          <>
            {/* Prompt + columns layout attribute. */}
            <LocalizedStringField
              label={t('noteOverridesEditorPromptLabel')}
              value={draft.prompt}
              onChange={(prompt) => update({ ...draft, prompt })}
              multiline
              testId="overrides-editor-prompt"
            />
            {/* Card width (columns) + option-grid column count (optcols) share one row. */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              {/* Labeled select matches the outlined text fields above it. */}
              <TextField
                select
                label={t('noteOverridesEditorColumnsLabel')}
                value={draft.columns}
                onChange={(event) => update({ ...draft, columns: Number(event.target.value) })}
                size="small"
                sx={{ width: 200 }}
              >
                <MenuItem value={0}>{t('noteOverridesEditorColumnsAuto')}</MenuItem>
                {[1, 2, 3, 4, 5, 6].map((columns) => <MenuItem key={columns} value={columns}>{columns}</MenuItem>)}
              </TextField>
              {/* Option-grid column count: 0 = auto-fit by card width, else a fixed column count. */}
              <TextField
                select
                label={t('noteOverridesEditorOptionColumnsLabel')}
                value={draft.optionColumns}
                onChange={(event) => update({ ...draft, optionColumns: Number(event.target.value) })}
                size="small"
                sx={{ width: 200 }}
              >
                <MenuItem value={0}>{t('noteOverridesEditorColumnsAuto')}</MenuItem>
                {[1, 2, 3, 4, 5, 6].map((cols) => <MenuItem key={cols} value={cols}>{cols}</MenuItem>)}
              </TextField>
            </Box>
            {/* Options list with add menu (one accordion expanded at a time). */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>{t('noteOverridesEditorOptionsHeader')}</Typography>
              {(['single', 'multi', 'slider'] as const).map((kind) => (
                <Button key={kind} size="small" variant="outlined" startIcon={<AddIcon fontSize="small" />} onClick={() => addOption(kind)} data-testid={`overrides-editor-add-${kind}`}>
                  {t(kind === 'single' ? 'noteOverridesEditorKindRadio' : kind === 'multi' ? 'noteOverridesEditorKindCheckbox' : 'noteOverridesEditorKindSlider')}
                </Button>
              ))}
            </Box>
            <Box>
              {draft.options.map((option, index) => (
                <OptionEditorCard
                  key={option.key}
                  hostDomain={draft.domain}
                  option={option}
                  index={index}
                  count={draft.options.length}
                  expanded={expandedKey === option.key}
                  onToggle={() => setExpandedKey((current) => (current === option.key ? null : option.key))}
                  onChange={(next) => updateOption(option.key, next)}
                  onRemove={() => removeOption(option.key)}
                  onMove={(delta) => moveOption(option.key, delta)}
                  onDuplicate={() => duplicateOption(option.key)}
                  knownTokens={knownTokens}
                  knownTags={knownTags}
                  metasets={metasets}
                  substatColors={substatColors}
                />
              ))}
            </Box>
            {answersReset && (
              <Alert severity="info" variant="outlined">{t('noteOverridesEditorAnswerResetInfo')}</Alert>
            )}
          </>
        ) : (
          // Spacer block: only the width attribute is editable.
          <TextField
            select
            label={t('noteOverridesEditorColumnsLabel')}
            value={draft.columns}
            onChange={(event) => update({ ...draft, columns: Number(event.target.value) })}
            size="small"
            sx={{ width: 200 }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((columns) => <MenuItem key={columns} value={columns}>{columns}</MenuItem>)}
          </TextField>
        )}
      </DialogContent>
      <DialogActions>
        {problems.length > 0 && (
          <Chip
            size="small"
            color="error"
            variant="outlined"
            label={t('noteOverridesEditorValidationErrors', { count: problems.length })}
            title={problems.map((p) => p.message).join('\n')}
            sx={{ mr: 'auto' }}
          />
        )}
        <Button size="small" onClick={requestClose}>{t('cancel')}</Button>
        <Button size="small" variant="contained" onClick={handleApply} disabled={problems.length > 0} data-testid="overrides-editor-apply">
          {t('noteOverridesEditorApply')}
        </Button>
      </DialogActions>
      {/* Dirty-close confirmation. */}
      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}>
        <DialogTitle>{t('noteOverridesEditorDiscardTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('noteOverridesEditorDiscardBody')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setConfirmDiscard(false)}>{t('noteOverridesEditorKeepEditing')}</Button>
          <Button size="small" color="error" variant="contained" onClick={onClose}>{t('noteOverridesEditorDiscardConfirm')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export function NoteOverridesBlockEditorDialog(props: NoteOverridesBlockEditorDialogProps): JSX.Element {
  const { request, onClose } = props
  return (
    <Dialog
      open={request !== null}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      // Above the note dialog's floating Paper (both share zIndex.modal; this portal
      // mounts later in the DOM so it paints on top).
      slotProps={{ paper: { sx: { height: '88vh' } } }}
      data-testid="overrides-editor-dialog"
    >
      {/* Keyed remount per open so state initializes fresh from the request. */}
      {request && <EditorContent key={request.nonce} {...props} request={request} />}
    </Dialog>
  )
}
