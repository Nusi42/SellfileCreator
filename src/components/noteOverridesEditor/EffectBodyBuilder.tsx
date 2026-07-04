/**
 * EffectBodyBuilder — structured editor for one option's `{ … }` effect body:
 * selector blocks (`@sel { ops }`), cross-domain blocks (`safeguard @…` inside recipe
 * options and vice versa), and the per-option `else { … }` section, plus a raw-DSL
 * fallback for bodies the structured model cannot hold.
 *
 * Rows edit DSL fragments validated live through the REAL parser (overridesEditorModel
 * bridges), so what the builder accepts is exactly what the note grammar accepts.
 */
import { useCallback, useMemo, useState } from 'react'
import type { JSX } from 'react'
import {
  Box, Button, Chip, Divider, IconButton, MenuItem, Select, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import CodeIcon from '@mui/icons-material/Code'
import { useI18n } from '../../lib/i18n'
import type { TranslateFn } from '../../lib/i18n'
import type {
  DraftOptionBody,
  DraftSelectorBlock,
  DraftStructuredBody,
  OverridesDomain,
} from '../../lib/overridesDraftTypes'
import { validateRawBody } from '../../lib/overridesDraft'
import {
  composeOperationText,
  operationFieldsFor,
  operationToText,
  parseOperationText,
  parseSelectorText,
  rawBodyToStructured,
  selectorFieldsFor,
  selectorToText,
  structuredBodyToRaw,
} from '../../lib/overridesEditorModel'
import type { RecipeOverridesOperation, RecipeOverridesSelector } from '../../lib/noteRecipeOverrides'
import type { NoteTagSelector } from '../../lib/noteOverridesParser'
import type { SafeguardOverridesOperation } from '../../lib/noteSafeguardOverrides'

// Monospace styling for DSL fragments (font only — colors stay on theme tokens).
const DSL_INPUT_SX = { '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.8rem' } } as const

// The four structured sections, keyed by their DraftStructuredBody array.
type SectionKey = 'blocks' | 'crossBlocks' | 'elseBlocks' | 'crossElseBlocks'

// Section domain: cross sections carry the opposite grammar.
const sectionDomain = (host: OverridesDomain, section: SectionKey): OverridesDomain => (
  section === 'crossBlocks' || section === 'crossElseBlocks'
    ? (host === 'recipe' ? 'safeguard' : 'recipe')
    : host
)

// Localized header per cross target domain (the section that patches the OTHER family).
const crossHeaderKey = (host: OverridesDomain): 'noteOverridesEditorEffectsCrossSafeguard' | 'noteOverridesEditorEffectsCrossRecipe' => (
  host === 'recipe' ? 'noteOverridesEditorEffectsCrossSafeguard' : 'noteOverridesEditorEffectsCrossRecipe'
)

export interface EffectBodyBuilderProps {
  hostDomain: OverridesDomain
  body: DraftOptionBody
  onChange: (next: DraftOptionBody) => void
}

// ── One selector block row ────────────────────────────────────────────────────

interface BlockRowProps {
  hostDomain: OverridesDomain
  block: DraftSelectorBlock
  onChange: (next: DraftSelectorBlock) => void
  onRemove: () => void
}

function BlockRowEditor({ hostDomain, block, onChange, onRemove }: BlockRowProps): JSX.Element {
  const { t } = useI18n()
  // Buffered selector text: committed to the draft only while it parses clean.
  const [selectorText, setSelectorText] = useState(() => selectorToText(block))
  const [selectorError, setSelectorError] = useState(false)
  // Add/edit-operation row state; editIndex ≥ 0 replaces that op on commit.
  const fields = useMemo(() => operationFieldsFor(block.domain), [block.domain])
  const [opField, setOpField] = useState(fields[0]?.field ?? '')
  const [opValue, setOpValue] = useState('')
  const [opError, setOpError] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const fieldMeta = fields.find((f) => f.field === opField)

  const handleSelectorChange = useCallback((text: string) => {
    setSelectorText(text)
    const parsed = parseSelectorText(hostDomain, block.domain, text)
    setSelectorError(parsed === null)
    if (parsed === null) return
    // Commit the parsed selector, preserving the block's domain discriminant.
    onChange(block.domain === 'recipe'
      ? { ...block, selector: parsed as RecipeOverridesSelector }
      : { ...block, selector: parsed as NoteTagSelector })
  }, [block, hostDomain, onChange])

  const commitOperation = useCallback(() => {
    const text = composeOperationText(opField, opValue)
    const parsed = parseOperationText(hostDomain, block.domain, text)
    setOpError(parsed === null)
    if (parsed === null) return
    const operations = [...block.operations]
    if (editIndex !== null && editIndex < operations.length) operations[editIndex] = parsed
    else operations.push(parsed)
    // Domain-preserving update keeps the discriminated union intact.
    onChange(block.domain === 'recipe'
      ? { ...block, operations: operations as RecipeOverridesOperation[] }
      : { ...block, operations: operations as SafeguardOverridesOperation[] })
    setOpValue('')
    setEditIndex(null)
  }, [block, editIndex, hostDomain, onChange, opField, opValue])

  const removeOperation = useCallback((index: number) => {
    const operations = block.operations.filter((_, i) => i !== index)
    onChange(block.domain === 'recipe'
      ? { ...block, operations: operations as RecipeOverridesOperation[] }
      : { ...block, operations: operations as SafeguardOverridesOperation[] })
    if (editIndex === index) { setEditIndex(null); setOpValue('') }
  }, [block, editIndex, onChange])

  // Load an existing op into the editor row (clicking its chip).
  const beginEditOperation = useCallback((index: number) => {
    const text = operationToText(block, index)
    // Split at the first comparison operator into field + value for the two widgets.
    const match = /^([a-z]+)(\.[^=<>]*)?(>=|<=|=)([\s\S]*)$/i.exec(text)
    if (match) {
      setOpField(match[1]!.toLowerCase())
      const dotted = match[2] ?? ''
      const op = match[3] === '=' ? '' : match[3]!
      setOpValue(dotted ? `${dotted}=${match[4]!}` : `${op}${match[4]!}`)
    } else {
      setOpValue(text)
    }
    setEditIndex(index)
    setOpError(false)
  }, [block])

  return (
    // Subtle inset surface so each rule block reads as one unit inside the option card.
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.25, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: 'background.default' }}>
      {/* Selector row: `@` sigil + validated expression text. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>@</Typography>
        <TextField
          value={selectorText}
          onChange={(event) => handleSelectorChange(event.target.value)}
          size="small"
          fullWidth
          error={selectorError}
          label={t('noteOverridesEditorSelectorLabel')}
          helperText={selectorError
            ? t('noteOverridesEditorSelectorInvalid', { fields: selectorFieldsFor(block.domain).join(', ') })
            : undefined}
          sx={DSL_INPUT_SX}
          slotProps={{ htmlInput: { 'data-testid': 'overrides-editor-selector' } }}
        />
        <Tooltip title={t('noteOverridesEditorRemoveBlock')}>
          <IconButton size="small" onClick={onRemove} aria-label={t('noteOverridesEditorRemoveBlock')}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {/* Existing operations as editable chips. */}
      {block.operations.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {block.operations.map((_, index) => (
            <Chip
              // Position is the identity here — ops have no ids and may repeat.
              // eslint-disable-next-line @eslint-react/no-array-index-key
              key={index}
              label={operationToText(block, index)}
              size="small"
              variant={editIndex === index ? 'filled' : 'outlined'}
              onClick={() => beginEditOperation(index)}
              onDelete={() => removeOperation(index)}
              sx={{ '& .MuiChip-label': { fontFamily: 'monospace', fontSize: '0.72rem' } }}
            />
          ))}
        </Box>
      )}
      {/* Add / edit one operation: field dropdown + value widget. */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <Select
          value={opField}
          onChange={(event) => { setOpField(event.target.value); setOpValue(''); setOpError(false) }}
          size="small"
          sx={{ minWidth: 130, fontFamily: 'monospace', fontSize: '0.8rem' }}
          aria-label={t('noteOverridesEditorOperationField')}
          data-testid="overrides-editor-op-field"
        >
          {fields.map((f) => (
            <MenuItem key={f.field} value={f.field} sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{f.field}</MenuItem>
          ))}
        </Select>
        {fieldMeta?.values ? (
          // Closed value set → dropdown (export=active, activation=off, …).
          <Select
            value={fieldMeta.values.includes(opValue) ? opValue : ''}
            onChange={(event) => { setOpValue(event.target.value); setOpError(false) }}
            size="small"
            displayEmpty
            sx={{ minWidth: 140, fontFamily: 'monospace', fontSize: '0.8rem' }}
            aria-label={t('noteOverridesEditorOperationValue')}
            data-testid="overrides-editor-op-value-select"
          >
            <MenuItem value="" disabled>{t('noteOverridesEditorOperationValue')}</MenuItem>
            {fieldMeta.values.map((v) => (
              <MenuItem key={v} value={v} sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{v}</MenuItem>
            ))}
          </Select>
        ) : (
          // Free-form value with a grammar example as placeholder; Enter commits.
          <TextField
            value={opValue}
            onChange={(event) => { setOpValue(event.target.value); setOpError(false) }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitOperation() } }}
            size="small"
            fullWidth
            error={opError}
            placeholder={fieldMeta?.example}
            helperText={opError ? t('noteOverridesEditorOperationInvalid') : undefined}
            sx={DSL_INPUT_SX}
          />
        )}
        <Tooltip title={t('noteOverridesEditorAddOperation')}>
          <span>
            <IconButton size="small" onClick={commitOperation} disabled={!opValue.trim()} aria-label={t('noteOverridesEditorAddOperation')} data-testid="overrides-editor-op-add">
              <AddIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  )
}

// ── Section (one of main / cross / else / crossElse) ──────────────────────────

// Fresh block template per domain: matches everything, no ops yet (the row demands
// at least one op before Apply passes validation — empty blocks vanish on parse).
const emptyBlock = (domain: OverridesDomain): DraftSelectorBlock => (
  domain === 'recipe'
    ? { domain: 'recipe', selector: { kind: 'all' }, operations: [] }
    : { domain: 'safeguard', selector: { kind: 'all' }, operations: [] }
)

interface SectionProps {
  hostDomain: OverridesDomain
  section: SectionKey
  header: string
  body: DraftStructuredBody
  onChange: (next: DraftStructuredBody) => void
}

function BlockSection({ hostDomain, section, header, body, onChange }: SectionProps): JSX.Element {
  const { t } = useI18n()
  const blocks = body[section]
  const domain = sectionDomain(hostDomain, section)
  const updateAt = useCallback((index: number, next: DraftSelectorBlock) => {
    onChange({ ...body, [section]: blocks.map((b, i) => (i === index ? next : b)) })
  }, [blocks, body, onChange, section])
  const removeAt = useCallback((index: number) => {
    onChange({ ...body, [section]: blocks.filter((_, i) => i !== index) })
  }, [blocks, body, onChange, section])
  const add = useCallback(() => {
    onChange({ ...body, [section]: [...blocks, emptyBlock(domain)] })
  }, [blocks, body, domain, onChange, section])
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.2 }}>{header}</Typography>
        <Button size="small" variant="text" startIcon={<AddIcon fontSize="small" />} onClick={add} sx={{ py: 0, minWidth: 0 }} data-testid={`overrides-editor-add-block-${section}`}>
          {t('noteOverridesEditorAddBlock')}
        </Button>
      </Box>
      {blocks.map((block, index) => (
        <BlockRowEditor
          // Same rationale as the op chips: blocks are positional, editing is keyed by slot.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={`${section}-${index}`}
          hostDomain={hostDomain}
          block={block}
          onChange={(next) => updateAt(index, next)}
          onRemove={() => removeAt(index)}
        />
      ))}
    </Box>
  )
}

// ── Raw fallback editor ───────────────────────────────────────────────────────

interface RawBodyEditorProps {
  hostDomain: OverridesDomain
  text: string
  onChange: (text: string) => void
  onSwitchToStructured: (structured: DraftStructuredBody) => void
  t: TranslateFn
}

function RawBodyEditor({ hostDomain, text, onChange, onSwitchToStructured, t }: RawBodyEditorProps): JSX.Element {
  // Live diagnostics for the verbatim body text.
  const diagnostics = useMemo(() => validateRawBody(hostDomain, text), [hostDomain, text])
  // The structured toggle is available only when the body converts losslessly.
  const structured = useMemo(() => (diagnostics.length === 0 ? rawBodyToStructured(hostDomain, text) : null), [diagnostics, hostDomain, text])
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <TextField
        value={text}
        onChange={(event) => onChange(event.target.value)}
        size="small"
        fullWidth
        multiline
        minRows={2}
        error={diagnostics.length > 0}
        label={t('noteOverridesEditorRawToggle')}
        helperText={diagnostics.length > 0 ? diagnostics[0]!.message : t('noteOverridesEditorRawHelper')}
        sx={DSL_INPUT_SX}
      />
      <Box>
        <Tooltip title={structured ? '' : t('noteOverridesEditorStructuredBlocked')}>
          <span>
            <Button size="small" variant="text" disabled={!structured} onClick={() => structured && onSwitchToStructured(structured)}>
              {t('noteOverridesEditorStructuredToggle')}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  )
}

// ── Top-level builder ─────────────────────────────────────────────────────────

export function EffectBodyBuilder({ hostDomain, body, onChange }: EffectBodyBuilderProps): JSX.Element {
  const { t } = useI18n()
  const switchToRaw = useCallback(() => {
    if (body.kind !== 'structured') return
    const raw = structuredBodyToRaw(hostDomain, body)
    if (raw !== null) onChange({ kind: 'raw', text: raw })
  }, [body, hostDomain, onChange])
  if (body.kind === 'raw') {
    return (
      <RawBodyEditor
        hostDomain={hostDomain}
        text={body.text}
        onChange={(text) => onChange({ kind: 'raw', text })}
        onSwitchToStructured={(structured) => onChange(structured)}
        t={t}
      />
    )
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* When-selected sections: same-domain blocks, then cross-domain blocks. */}
      <BlockSection hostDomain={hostDomain} section="blocks" header={t('noteOverridesEditorEffectsHeader')} body={body} onChange={onChange} />
      <BlockSection hostDomain={hostDomain} section="crossBlocks" header={t(crossHeaderKey(hostDomain))} body={body} onChange={onChange} />
      <Divider flexItem />
      {/* Else sections: applied while the option is NOT selected. */}
      <BlockSection hostDomain={hostDomain} section="elseBlocks" header={t('noteOverridesEditorEffectsElse')} body={body} onChange={onChange} />
      <BlockSection hostDomain={hostDomain} section="crossElseBlocks" header={`${t('noteOverridesEditorEffectsElse')} — ${t(crossHeaderKey(hostDomain))}`} body={body} onChange={onChange} />
      <Box>
        <Button size="small" variant="text" startIcon={<CodeIcon fontSize="small" />} onClick={switchToRaw}>
          {t('noteOverridesEditorRawToggle')}
        </Button>
      </Box>
    </Box>
  )
}
