/**
 * EffectBodyBuilder — structured editor for one option's `{ … }` effect body:
 * selector blocks (`@sel { ops }`), cross-domain blocks (`safeguard @…` inside recipe
 * options and vice versa), and the per-option `else { … }` section, plus a raw-DSL
 * fallback for bodies the structured model cannot hold.
 *
 * Selectors are edited as visual CONDITION ROWS (kind dropdown, not-toggle, op and
 * value widgets, and/or connective) so authors never need to know the DSL keywords;
 * a per-block raw text field remains for selector shapes the rows cannot express.
 * Everything is validated live through the REAL parser (overridesEditorModel
 * bridges), so what the builder accepts is exactly what the note grammar accepts.
 */
import { Fragment, useCallback, useMemo, useState } from 'react'
import type { JSX } from 'react'
import {
  Autocomplete, Box, Button, Chip, Divider, IconButton, MenuItem, Select, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, alpha,
} from '@mui/material'
// Fixed JS alpha for the empty-block warning wash (SSOT — no inline magic numbers).
import { ALPHA } from '../../lib/colorTints'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import CodeIcon from '@mui/icons-material/Code'
import TuneIcon from '@mui/icons-material/Tune'
// Points at the add-operation button when a block still needs its first assignment.
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useI18n } from '../../lib/i18n'
import type { I18nKey, TranslateFn } from '../../lib/i18n'
// Shared domain selects: closed-vocabulary values render through the SAME controls
// (and therefore the SAME localization + theme-color SSOTs) as the rest of the app.
import { GearFactionSelect, GearMainStatSelect, GearRankSelect, GearRaritySelect, GearSetsSelect, GearSlotSelect, GearSubstatSelect } from '../gear'
import { RarityLabel } from '../RarityLabel'
import type { Metaset } from '../../lib/metasets'
import type { ArtifactSetSelectionEntry } from '../../lib/gearSets/selection'
import { useDisplayPreferences } from '../../state/preferencesState'
import { scopeColorsControls } from '../../lib/colorScope'
import type { RankValue, StatVariant } from '../../lib/types'
import type {
  DraftOptionBody,
  DraftSelectorBlock,
  DraftStructuredBody,
  OverridesDomain,
} from '../../lib/overridesDraftTypes'
import { validateRawBody } from '../../lib/overridesDraft'
import {
  type AnyOverridesSelector,
  type FlatSelector,
  type FlatSelectorTerm,
  type SelectorTermOption,
  type SelectorTermView,
  buildSelectorFromFlat,
  composeOperationText,
  defaultViewForOption,
  dslSubstatKeys,
  dslMainStatKeys,
  flattenSelector,
  levelRangeText,
  matchOperationTerm,
  operationFieldText,
  operationSupportsSliderValue,
  operationTermOptionsFor,
  operationToText,
  parseLevelRangeValue,
  parseOperationText,
  parseSelectorLeafText,
  parseSelectorText,
  parseSliderValueCalc,
  parseTokenListValues,
  rawBodyToStructured,
  selectorFieldsFor,
  selectorLeafToView,
  selectorTermOptionsFor,
  selectorTermText,
  selectorToText,
  selectorViewOptionId,
  sliderValueCalcText,
  structuredBodyToRaw,
  tokenListText,
  factionIdToName,
  factionNameToId,
  gearsetIdToName,
  gearsetNameToId,
  rarityNameToRank,
  rarityRankToName,
  slotIdToToken,
  slotTokenToId,
  statKeyToVariant,
  statVariantToKey,
  parsePrefixedTokenListValues,
  prefixedTokenListText,
  LIST_TOKEN_PREFIX_TEXT,
  LEVEL_MILESTONE_CHOICES,
  type OperationTermOption,
  type PrefixedListEntry,
  type SliderValueCalc,
  type ValueControlKind,
} from '../../lib/overridesEditorModel'
import { NOTE_OVERRIDES_LOGIC_KEYWORDS, type ListTokenPrefix } from '../../lib/noteOverridesParser'
import type { RecipeOverridesOperation, RecipeOverridesSelector } from '../../lib/noteRecipeOverrides'
import type { NoteTagSelector } from '../../lib/noteOverridesParser'
import type { SafeguardOverridesOperation } from '../../lib/noteSafeguardOverrides'
import { DslHighlightedField } from './DslHighlightedField'
import { OverridesNumberField } from './OverridesNumberField'

// Monospace styling for DSL fragments (font only — colors stay on theme tokens).
const DSL_INPUT_SX = { '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.8rem' } } as const

// Compact monospace styling shared by the term-row selects and toggles.
const TERM_SELECT_SX = { fontFamily: 'monospace', fontSize: '0.8rem' } as const

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
  // Tag suggestions for the condition rows (tags used anywhere in the note).
  knownTags: string[]
  // The app's metasets — vocabulary for the `metasets=` value control.
  metasets: Metaset[]
  // User substat colors for the stat selects (flag-gated by the stat color scope).
  substatColors: Record<number, { fg: string; bg: string }>
}

/** Level-window value widget: from–to milestone pickers (single level when equal). */
function LevelRangeValueEditor({ value, onText }: { value: string; onText: (text: string) => void }): JSX.Element {
  const range = parseLevelRangeValue(value)
    ?? { from: LEVEL_MILESTONE_CHOICES[0], to: LEVEL_MILESTONE_CHOICES[LEVEL_MILESTONE_CHOICES.length - 1]! }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Select value={range.from} size="small" onChange={(event) => onText(levelRangeText({ from: event.target.value, to: range.to }))} sx={TERM_SELECT_SX}>
        {LEVEL_MILESTONE_CHOICES.map((level) => <MenuItem key={level} value={level} sx={TERM_SELECT_SX}>{level}</MenuItem>)}
      </Select>
      <Typography sx={{ color: 'text.secondary' }}>–</Typography>
      <Select value={range.to} size="small" onChange={(event) => onText(levelRangeText({ from: range.from, to: event.target.value }))} sx={TERM_SELECT_SX}>
        {LEVEL_MILESTONE_CHOICES.map((level) => <MenuItem key={level} value={level} sx={TERM_SELECT_SX}>{level}</MenuItem>)}
      </Select>
    </Box>
  )
}

// ── One visual condition row ──────────────────────────────────────────────────

interface SelectorTermRowProps {
  hostDomain: OverridesDomain
  blockDomain: OverridesDomain
  negated: boolean
  leaf: AnyOverridesSelector
  knownTags: string[]
  substatColors: Record<number, { fg: string; bg: string }>
  onCommit: (term: FlatSelectorTerm) => void
  onRemove: () => void
}

// Display glyphs for the comparison ops (ASCII stays in the DSL; UI shows ≥/≤).
const OP_GLYPH: Record<'=' | '>=' | '<=', string> = { '=': '=', '>=': '≥', '<=': '≤' }

// Shared dropdown label for a field/condition concept: the localized catalog term,
// qualified by its explicit detail (minima's Any-rank fallback) or by the dotted-family
// suffix so per-★/per-stat variants are distinguishable from their plain twin.
const conceptLabel = (
  t: TranslateFn,
  entry: { labelKey: I18nKey; labelDetailKey?: I18nKey | undefined; star: boolean; stat: boolean },
): string => {
  const detail = entry.labelDetailKey ? ` · ${t(entry.labelDetailKey)}` : entry.star ? ' · ★/stat' : entry.stat ? ' · stat' : ''
  return `${t(entry.labelKey)}${detail}`
}

// Localized label for one closed-vocabulary VALUE; the DSL token when unlabeled.
const choiceLabel = (
  t: TranslateFn,
  valueLabelKeys: Readonly<Partial<Record<string, I18nKey>>> | undefined,
  choice: string,
): string => {
  const key = valueLabelKeys?.[choice]
  return key ? t(key) : choice
}

// ── Shared domain value controls ──────────────────────────────────────────────
// The metadata `control` tag routes closed vocabularies to the app's Gear*Select
// family, so the overrides editor shows the SAME pickers (3×3 slot grid, tinted
// rarity words, colored substats — all flag-gated by their own color scopes) as the
// Builder/Safeguards panels. Values stay DSL token strings; the converters from
// overridesEditorModel map tokens ⇄ domain ids losslessly.

const SINGLE_VALUE_CONTROLS: ReadonlySet<ValueControlKind> = new Set(['rankValue', 'starValue', 'rarityValue'])
const LIST_VALUE_CONTROLS: ReadonlySet<ValueControlKind> = new Set(['slots', 'factions', 'substats', 'mainstats', 'gearsets', 'metasets', 'rankList', 'rarityList'])

// Non-null-filtering mapper (converters are total over validated tokens; the filter
// only guards against vocabulary drift).
const mapDefined = <T, R>(values: readonly T[], convert: (value: T) => R | null): R[] => (
  values.map(convert).filter((entry): entry is R => entry !== null)
)

// The DSL stat keys as StatVariants. Substat and mainstat positions draw from
// DIFFERENT vocabularies: mode-damage substats are valid
// substats but can never be a main stat, so offering them in a mainstat select
// would let the user author an unselectable value.
const dslSubstatVariants = (): StatVariant[] => mapDefined(dslSubstatKeys(), statKeyToVariant)
const dslMainStatVariants = (): StatVariant[] => mapDefined(dslMainStatKeys(), statKeyToVariant)

/** Single-value control: rank (with Any), star rank, or rarity (with Any/Auto). */
function SingleValueControl({ control, choices, valueLabelKeys, value, onChange, t }: {
  control: ValueControlKind
  choices: readonly string[]
  valueLabelKeys: Readonly<Partial<Record<string, I18nKey>>> | undefined
  value: string
  onChange: (next: string) => void
  t: TranslateFn
}): JSX.Element {
  if (control === 'rankValue' || control === 'starValue') {
    const numeric = Number.parseInt(value, 10)
    return (
      <GearRankSelect
        value={Number.isFinite(numeric) ? (numeric as RankValue) : null}
        // Only the rank enum carries the grammar's 'any'; minima.any is 1–6 only.
        allowAny={control === 'rankValue'}
        onChange={(next) => onChange(next === null ? 'any' : String(next))}
        sx={{ minWidth: 96 }}
      />
    )
  }
  // rarityValue: the grammar adds 'auto' (no GearRaritySelect item exists for it), so
  // render a plain Select whose rarity words go through RarityLabel — the same tinted,
  // scope-gated rendering the Builder's rarity dropdown uses.
  return (
    <Select
      value={choices.includes(value) ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      size="small"
      displayEmpty
      sx={{ minWidth: 140 }}
      aria-label={t('noteOverridesEditorOperationValue')}
    >
      <MenuItem value="" disabled>{t('noteOverridesEditorOperationValue')}</MenuItem>
      {choices.map((choice) => {
        const rank = rarityNameToRank(choice)
        return (
          <MenuItem key={choice} value={choice}>
            {rank !== null ? <RarityLabel rarity={rank} inControl /> : choiceLabel(t, valueLabelKeys, choice)}
          </MenuItem>
        )
      })}
    </Select>
  )
}

// Prefix cycle for gearsets chips in Modify mode: + (add) → +- (excluded add) → - (remove).
const GEARSET_PREFIX_CYCLE: Record<ListTokenPrefix, ListTokenPrefix> = {
  add: 'addExcluded',
  addExcluded: 'remove',
  remove: 'add',
  // Bare entries only exist in Replace mode, where chips do not cycle.
  none: 'none',
}

/** Gear-set list value control with the DSL's mutate-prefix support: a Replace/Modify
 *  mode toggle, the app's own sets select for membership (right-click a set = toggle
 *  the `+-` excluded-add), and one chip per entry whose prefix cycles on click in
 *  Modify mode (+ → +- → -). Replace mode holds bare includes only — that grammar has
 *  no exclusions, so switching back strips prefixes and drops `-` removals. */
function GearsetsListValueControl({ entries, onEntries }: {
  entries: PrefixedListEntry[]
  onEntries: (next: PrefixedListEntry[]) => void
}): JSX.Element {
  const { t } = useI18n()
  const mode: 'replace' | 'modify' = entries.some((entry) => entry.prefix !== 'none') ? 'modify' : 'replace'
  // Select membership: every entry that resolves to a set id; excluded ring for `+-`.
  const selectValue = mapDefined(entries, (entry) => {
    const id = gearsetNameToId(entry.name)
    if (id === null) return null
    return (entry.prefix === 'addExcluded' ? { id, excluded: true } : { id }) as ArtifactSetSelectionEntry
  })
  // Membership reconcile: retained names keep their prefix; new picks get the mode's
  // default prefix; deselected names drop their entry.
  const reconcile = (next: ArtifactSetSelectionEntry[]) => {
    const nextNames = mapDefined(next, (entry) => gearsetIdToName(Number(entry.id)))
    const nameSet = new Set(nextNames)
    const kept = entries.filter((entry) => nameSet.has(entry.name))
    const known = new Set(kept.map((entry) => entry.name))
    const added = nextNames.filter((name) => !known.has(name))
    onEntries([
      ...kept,
      ...added.map((name): PrefixedListEntry => ({ name, prefix: mode === 'modify' ? 'add' : 'none' })),
    ])
  }
  // Right-click on a set row toggles the excluded-add prefix; from Replace mode this
  // promotes the whole list to Modify first (the replace grammar has no exclusions).
  const toggleExcluded = (id: number) => {
    const name = gearsetIdToName(id)
    if (name === null) return
    const promoted = entries.map((entry): PrefixedListEntry => (
      entry.prefix === 'none' ? { ...entry, prefix: 'add' } : entry
    ))
    const existing = promoted.find((entry) => entry.name === name)
    if (!existing) {
      onEntries([...promoted, { name, prefix: 'addExcluded' }])
      return
    }
    onEntries(promoted.map((entry) => (
      entry.name === name
        ? { ...entry, prefix: entry.prefix === 'addExcluded' ? 'add' : 'addExcluded' }
        : entry
    )))
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 260, flex: 1 }}>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          onChange={(_, next) => {
            if (!next || next === mode) return
            if (next === 'modify') {
              onEntries(entries.map((entry) => ({ ...entry, prefix: 'add' as const })))
            } else {
              onEntries(entries
                .filter((entry) => entry.prefix !== 'remove')
                .map((entry) => ({ ...entry, prefix: 'none' as const })))
            }
          }}
        >
          <ToggleButton value="replace" sx={{ px: 1, ...TERM_SELECT_SX }} aria-label={t('noteOverridesEditorGearsetsReplaceMode')}>
            <Tooltip title={t('noteOverridesEditorGearsetsReplaceMode')}><span>=</span></Tooltip>
          </ToggleButton>
          <ToggleButton value="modify" sx={{ px: 1, ...TERM_SELECT_SX }} aria-label={t('noteOverridesEditorGearsetsModifyMode')}>
            <Tooltip title={t('noteOverridesEditorGearsetsModifyMode')}><span>±</span></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
        <GearSetsSelect
          value={selectValue}
          onChange={reconcile}
          onContextMenuSet={toggleExcluded}
          showMetasets={false}
          minWidthPx={220}
        />
      </Box>
      {entries.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {entries.map((entry) => (
            <Chip
              key={`${entry.prefix}:${entry.name}`}
              size="small"
              label={`${LIST_TOKEN_PREFIX_TEXT[entry.prefix]}${entry.name}`}
              sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
              onClick={mode === 'modify'
                ? () => onEntries(entries.map((candidate) => (
                  candidate === entry
                    ? { ...candidate, prefix: GEARSET_PREFIX_CYCLE[candidate.prefix] }
                    : candidate
                )))
                : undefined}
              onDelete={() => onEntries(entries.filter((candidate) => candidate !== entry))}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

/** Token-list control: routes to the matching domain select (slots grid, factions,
 *  substats/mainstats, sets, metasets, ranks, rarities). Tokens are the validated
 *  canonical choice spellings (parseTokenListValues output). */
function ListValueControl({ control, tokens, onTokens, metasets, colorStatControls, substatColors }: {
  control: ValueControlKind
  tokens: string[]
  onTokens: (next: string[]) => void
  metasets: Metaset[]
  colorStatControls: boolean
  substatColors: Record<number, { fg: string; bg: string }>
}): JSX.Element | null {
  const listSx = { minWidth: 220, flex: 1 } as const
  switch (control) {
    case 'slots':
      // The standard 3×3 slot grid (GearSlotSelect renders its menu as the grid).
      return (
        <GearSlotSelect
          multiple
          value={mapDefined(tokens, slotTokenToId)}
          onChange={(ids) => onTokens(mapDefined(ids, slotIdToToken))}
          sx={listSx}
        />
      )
    case 'factions':
      return (
        <GearFactionSelect
          multiple
          value={mapDefined(tokens, factionNameToId)}
          onChange={(ids) => onTokens(mapDefined(ids, factionIdToName))}
          sx={listSx}
        />
      )
    case 'substats':
      return (
        <GearSubstatSelect
          multiple
          options={dslSubstatVariants()}
          value={mapDefined(tokens, statKeyToVariant)}
          onChange={(variants) => onTokens(variants.map(statVariantToKey))}
          colorOverrides={substatColors}
          showBorderColors={colorStatControls}
          sx={listSx}
        />
      )
    case 'mainstats':
      return (
        <GearMainStatSelect
          multiple
          options={dslMainStatVariants()}
          value={mapDefined(tokens, statKeyToVariant)}
          onChange={(variants) => onTokens(variants.map(statVariantToKey))}
          colorOverrides={substatColors}
          showBorderColors={colorStatControls}
          sx={listSx}
        />
      )
    // 'gearsets' never reaches this switch: the op row routes it to the dedicated
    // prefix-aware GearsetsListValueControl (mutate `+`/`+-`/`-` support) instead.
    case 'metasets':
      // Metasets-only picker: same select, sets section hidden. Names are the ids.
      return (
        <GearSetsSelect
          value={[]}
          onChange={() => {}}
          metasets={metasets}
          selectedMetasetIds={tokens}
          onChangeMetasetIds={onTokens}
          showSets={false}
          minWidthPx={220}
        />
      )
    case 'rankList':
      return (
        <GearRankSelect
          multiple
          value={mapDefined(tokens, (token) => {
            const numeric = Number.parseInt(token, 10)
            return Number.isFinite(numeric) ? (numeric as RankValue) : null
          })}
          onChange={(ranks) => onTokens(ranks.map(String))}
          sx={listSx}
        />
      )
    case 'rarityList':
      return (
        <GearRaritySelect
          multiple
          value={mapDefined(tokens, rarityNameToRank)}
          onChange={(ranks) => onTokens(mapDefined(ranks.map(Number), rarityRankToName))}
          sx={listSx}
        />
      )
    default:
      return null
  }
}

/** Stat picker for the dotted field families (substatmin.SPD, weight.CR%…): the app's
 *  substat select, with user colors when the stat color scope covers controls. */
function StatKeyPicker({ value, onChange, colorStatControls, substatColors }: {
  value: string
  onChange: (next: string) => void
  colorStatControls: boolean
  substatColors: Record<number, { fg: string; bg: string }>
}): JSX.Element {
  // Dotted stat fields are substat positions.
  const options = dslSubstatVariants()
  const variant = statKeyToVariant(value)
  return (
    <GearSubstatSelect
      value={variant ?? options[0]!}
      onChange={(next) => onChange(statVariantToKey(next))}
      options={options}
      colorOverrides={substatColors}
      showBorderColors={colorStatControls}
      sx={{ minWidth: 110 }}
    />
  )
}

/** Star picker for the ★-keyed minima family — the app's rank select. */
function StarKeyPicker({ value, onChange }: { value: string; onChange: (next: string) => void }): JSX.Element {
  const numeric = Number.parseInt(value, 10)
  return (
    <GearRankSelect
      value={Number.isFinite(numeric) ? (numeric as RankValue) : null}
      onChange={(next) => { if (next !== null) onChange(String(next)) }}
      sx={{ minWidth: 84 }}
    />
  )
}

// Display glyphs for the calc arithmetic operators.
const CALC_OPS: ReadonlyArray<{ op: '/' | '*' | '+' | '-'; glyph: string }> = [
  { op: '/', glyph: '÷' }, { op: '*', glyph: '×' }, { op: '+', glyph: '+' }, { op: '-', glyph: '−' },
]

/**
 * Visual editor for the simple slider-value expressions ($value, $value/8, plain
 * numbers) accepted by calc-capable fields. Edits the op row's value TEXT — the
 * commit path (compose + parse through the real grammar) stays identical.
 */
function SliderValueCalcEditor({ calc, onText }: { calc: SliderValueCalc; onText: (text: string) => void }): JSX.Element {
  const { t } = useI18n()
  const commit = (next: SliderValueCalc): void => onText(sliderValueCalcText(next))
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      {/* Source: the enclosing slider's value, or a fixed number. */}
      <Select
        value={calc.source}
        size="small"
        onChange={(event) => commit({ ...calc, source: event.target.value as 'slider' | 'number' })}
        sx={TERM_SELECT_SX}
      >
        <MenuItem value="slider" sx={TERM_SELECT_SX}>{t('noteOverridesEditorCalcSlider')}</MenuItem>
        <MenuItem value="number" sx={TERM_SELECT_SX}>{t('noteOverridesEditorCalcNumber')}</MenuItem>
      </Select>
      {calc.source === 'number' ? (
        <OverridesNumberField value={calc.base} onChange={(next) => commit({ ...calc, base: next })} ariaLabel={t('noteOverridesEditorCalcNumber')} width={96} />
      ) : (
        <>
          {/* Optional arithmetic on the slider value ($value ÷ 8 …). */}
          <Select
            value={calc.op ?? ''}
            size="small"
            displayEmpty
            onChange={(event) => {
              const value = event.target.value as '' | '/' | '*' | '+' | '-'
              commit({ ...calc, op: value === '' ? null : value })
            }}
            sx={TERM_SELECT_SX}
          >
            <MenuItem value="" sx={TERM_SELECT_SX}>—</MenuItem>
            {CALC_OPS.map((entry) => <MenuItem key={entry.op} value={entry.op} sx={TERM_SELECT_SX}>{entry.glyph}</MenuItem>)}
          </Select>
          {calc.op && (
            <OverridesNumberField value={calc.operand} onChange={(next) => commit({ ...calc, operand: next })} ariaLabel={t('noteOverridesEditorCalcNumber')} width={96} />
          )}
        </>
      )}
    </Box>
  )
}

function SelectorTermRow({ hostDomain, blockDomain, negated, leaf, knownTags, substatColors, onCommit, onRemove }: SelectorTermRowProps): JSX.Element {
  const { t } = useI18n()
  // Stat color scope: user substat colors reach the pickers only when the flag
  // covers control surfaces (same gate as the Builder/Safeguards panels).
  const { statColorScope } = useDisplayPreferences()
  const colorStatControls = scopeColorsControls(statColorScope)
  // Local draft view so incomplete edits (empty tag value) don't clobber the
  // committed leaf; commits go upward only when the composed term parses clean.
  const [view, setView] = useState<SelectorTermView>(() => selectorLeafToView(leaf) ?? { kind: 'all' })
  const [invalid, setInvalid] = useState(false)
  const options = useMemo(() => selectorTermOptionsFor(blockDomain), [blockDomain])
  const statKeys = useMemo(() => dslSubstatKeys(), [])
  const optionId = selectorViewOptionId(view)
  const option = options.find((entry) => entry.id === optionId)

  const tryCommit = useCallback((nextView: SelectorTermView) => {
    setView(nextView)
    // The real grammar is the validator: compose the term text and re-parse it.
    const parsedLeaf = parseSelectorLeafText(hostDomain, blockDomain, selectorTermText(nextView))
    if (!parsedLeaf) { setInvalid(true); return }
    setInvalid(false)
    onCommit({ negated, leaf: parsedLeaf })
  }, [blockDomain, hostDomain, negated, onCommit])

  // Dropdown labels: the SAME catalog terms the rest of the UI uses for these
  // concepts — labelKey is compile-required on every metadata entry.
  const kindLabel = useCallback((entry: SelectorTermOption): string => conceptLabel(t, entry), [t])

  // Dotted-family pieces (substatmin.SPD / minima.5.SPD) for the stat/star pickers.
  const fieldParts = view.kind === 'compare' ? view.field.split('.') : []
  const currentStat = option?.stat ? (fieldParts[fieldParts.length - 1] ?? statKeys[0] ?? '') : null
  const currentStar = option?.star ? (fieldParts[1] ?? '5') : null
  const recomposeField = (star: string | null, stat: string | null): string => (
    option?.id === 'minima.star.stat' ? `minima.${star}.${stat}` : `substatmin.${stat}`
  )

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      {/* Per-row negation ("not tag=x"); toggles on the committed leaf directly. */}
      <Tooltip title={t('noteOverridesEditorSelNot')}>
        <ToggleButton
          value="not"
          size="small"
          selected={negated}
          onChange={() => onCommit({ negated: !negated, leaf })}
          sx={{ px: 0.75, py: 0.25, textTransform: 'none', ...TERM_SELECT_SX }}
        >
          not
        </ToggleButton>
      </Tooltip>
      {/* Condition kind. */}
      <Select
        value={optionId}
        size="small"
        onChange={(event) => {
          const entry = options.find((candidate) => candidate.id === event.target.value)
          if (entry) tryCommit(defaultViewForOption(entry))
        }}
        data-testid="overrides-editor-term-kind"
      >
        {options.map((entry) => (
          <MenuItem key={entry.id} value={entry.id}>{kindLabel(entry)}</MenuItem>
        ))}
      </Select>
      {/* Star + stat pickers for the dotted field families — the app's own selects. */}
      {option?.star && view.kind === 'compare' && (
        <StarKeyPicker
          value={currentStar ?? '5'}
          onChange={(star) => tryCommit({ ...view, field: recomposeField(star, currentStat) })}
        />
      )}
      {option?.stat && view.kind === 'compare' && (
        <StatKeyPicker
          value={currentStat ?? (statKeys[0] ?? '')}
          onChange={(key) => tryCommit({ ...view, field: recomposeField(currentStar, key) })}
          colorStatControls={colorStatControls}
          substatColors={substatColors}
        />
      )}
      {/* Comparison operator (=/≥/≤) when the kind supports it. */}
      {option && option.ops.length > 0 && view.kind === 'compare' && (
        <Select
          value={view.op}
          size="small"
          error={invalid}
          onChange={(event) => tryCommit({ ...view, op: event.target.value as '=' | '>=' | '<=' })}
          sx={TERM_SELECT_SX}
        >
          {option.ops.map((op) => <MenuItem key={op} value={op} sx={TERM_SELECT_SX}>{OP_GLYPH[op]}</MenuItem>)}
        </Select>
      )}
      {/* Value widget per kind. */}
      {option?.value === 'tag' && view.kind === 'tag' && (
        <Autocomplete
          freeSolo
          size="small"
          options={knownTags}
          inputValue={view.value}
          // Only user typing commits — MUI fires a reason='reset' input change on
          // mount (with an empty value) that must never clobber the committed tag.
          onInputChange={(_, value, reason) => { if (reason === 'input') tryCommit({ kind: 'tag', value: value.trim().toLowerCase() }) }}
          onChange={(_, value) => { if (typeof value === 'string') tryCommit({ kind: 'tag', value: value.trim().toLowerCase() }) }}
          sx={{ minWidth: 180, flex: 1 }}
          renderInput={(params) => (
            <TextField {...params} size="small" error={invalid} label={t('noteOverridesEditorSelTagValue')} sx={DSL_INPUT_SX} />
          )}
        />
      )}
      {option?.value === 'tags' && view.kind === 'tagIn' && (
        <Autocomplete
          multiple
          freeSolo
          size="small"
          options={knownTags}
          value={view.values}
          onChange={(_, values) => tryCommit({ kind: 'tagIn', values: values.map((value) => String(value).trim().toLowerCase()).filter(Boolean) })}
          sx={{ minWidth: 220, flex: 1 }}
          renderInput={(params) => (
            <TextField {...params} size="small" error={invalid} label={t('noteOverridesEditorSelTagValue')} />
          )}
          slotProps={{ chip: { size: 'small', sx: { fontFamily: 'monospace', fontSize: '0.7rem' } } }}
        />
      )}
      {option?.value === 'choice' && option.control && SINGLE_VALUE_CONTROLS.has(option.control) && view.kind === 'compare' ? (
        // Rank/star/rarity conditions use the app's own value selects (tinted words,
        // star labels) — same controls as the Builder/Safeguards panels.
        <SingleValueControl
          control={option.control}
          choices={option.choices ?? []}
          valueLabelKeys={option.valueLabelKeys}
          value={view.value}
          onChange={(value) => tryCommit({ ...view, value })}
          t={t}
        />
      ) : option?.value === 'choice' ? (
        <Select
          size="small"
          error={invalid}
          value={view.kind === 'flex' ? view.value : view.kind === 'compare' ? view.value : ''}
          onChange={(event) => {
            if (view.kind === 'flex') tryCommit({ kind: 'flex', value: event.target.value as 'on' | 'off' })
            else if (view.kind === 'compare') tryCommit({ ...view, value: event.target.value })
          }}
          sx={TERM_SELECT_SX}
        >
          {(option.choices ?? []).map((choice) => (
            // Localized value label where the vocabulary has catalog terms (on/off…);
            // monospace DSL token otherwise.
            <MenuItem key={choice} value={choice} sx={option.valueLabelKeys?.[choice] ? undefined : TERM_SELECT_SX}>
              {choiceLabel(t, option.valueLabelKeys, choice)}
            </MenuItem>
          ))}
        </Select>
      ) : null}
      {option?.value === 'number' && view.kind === 'compare' && (
        <OverridesNumberField
          value={Number.parseFloat(view.value) || 0}
          onChange={(next) => tryCommit({ ...view, value: String(next) })}
          ariaLabel={option.token}
          // Bounds/step mirror the field's apply-side clamp (metadata SSOT).
          min={option.range?.min}
          max={option.range?.max}
          step={option.range?.step ?? 1}
          width={88}
        />
      )}
      <Tooltip title={t('noteOverridesEditorSelRemoveTerm')}>
        <IconButton size="small" onClick={onRemove} aria-label={t('noteOverridesEditorSelRemoveTerm')}>
          <CloseIcon sx={{ fontSize: '0.95rem' }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

// ── One selector block row ────────────────────────────────────────────────────

interface BlockRowProps {
  hostDomain: OverridesDomain
  block: DraftSelectorBlock
  knownTags: string[]
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  onChange: (next: DraftSelectorBlock) => void
  onRemove: () => void
}

// Widget pieces of the add/edit-operation row (composed into one DSL assignment).
type OpRowState = { option: OperationTermOption; star: string; stat: string; op: '=' | '>=' | '<='; value: string }

function BlockRowEditor({ hostDomain, block, knownTags, metasets, substatColors, onChange, onRemove }: BlockRowProps): JSX.Element {
  const { t } = useI18n()
  // Stat color scope gate for the stat pickers/lists (see SelectorTermRow).
  const { statColorScope } = useDisplayPreferences()
  const colorStatControls = scopeColorsControls(statColorScope)
  // Visual condition rows are possible when the selector flattens to one connective
  // with row-representable leaves; otherwise the raw DSL field is the only editor.
  const visualFlat = useMemo(() => {
    const flat = flattenSelector(block.selector as AnyOverridesSelector)
    if (!flat || !flat.terms.every((term) => selectorLeafToView(term.leaf) !== null)) return null
    return flat
  }, [block.selector])
  const [dslMode, setDslMode] = useState(() => visualFlat === null)
  // Buffered selector text (raw mode): committed to the draft only while it parses clean.
  const [selectorText, setSelectorText] = useState(() => selectorToText(block))
  const [selectorError, setSelectorError] = useState(false)
  // Add/edit-operation row state (option + star/stat/op pickers + value text);
  // editIndex ≥ 0 replaces that op on commit.
  const opOptions = useMemo(() => operationTermOptionsFor(block.domain), [block.domain])
  const opStatKeys = useMemo(() => dslSubstatKeys(), [])
  const [opRow, setOpRow] = useState<OpRowState>(() => ({
    option: opOptions[0]!, star: '5', stat: opStatKeys[0] ?? 'SPD', op: '=', value: '',
  }))
  const [opError, setOpError] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)

  // Full assignment text for the current widget pieces (single compose path).
  const opRowText = (state: OpRowState): string => composeOperationText(
    operationFieldText(state.option, state.star, state.stat),
    `${state.op !== '=' ? state.op : ''}${state.value}`,
  )
  // Central updater: EVERY widget change re-validates through the real grammar, so
  // invalid values (unknown stats, bad ranges) show their error while typing.
  const updateOpRow = (partial: Partial<OpRowState>): void => {
    const next = { ...opRow, ...partial }
    setOpRow(next)
    setOpError(next.value.trim() !== '' && parseOperationText(hostDomain, block.domain, opRowText(next)) === null)
  }
  // Seed value per widget so switching kinds lands on something committable.
  const seedOpValue = (option: OperationTermOption): string => {
    if (operationSupportsSliderValue(hostDomain, block.domain, option.field)) return '$value'
    if (option.widget === 'level') return `${LEVEL_MILESTONE_CHOICES[0]}-${LEVEL_MILESTONE_CHOICES[LEVEL_MILESTONE_CHOICES.length - 1]!}`
    if (option.widget === 'number') return String(option.range?.min ?? 1)
    // Single-value domain selects start on their first grammar value ('any', 1★…).
    if (option.control && SINGLE_VALUE_CONTROLS.has(option.control)) return option.choices?.[0] ?? ''
    return ''
  }
  // Visual calc state for $value-capable fields; null when the field doesn't take
  // $value or the current text is a richer expression than the widget can show
  // (parens, cross-slider refs) — those keep the free-text editor.
  const calcState = operationSupportsSliderValue(hostDomain, block.domain, opRow.option.field)
    ? parseSliderValueCalc(opRow.value)
    : null
  // Domain-select routing: token vocabulary for the list controls (metasets' comes
  // from the app state, not the static metadata) and the parsed token list. A null
  // token list (mutate prefixes, unknown names) falls back to the validated text/chip
  // widgets below — nothing is ever silently dropped.
  const opListChoices = opRow.option.control === 'metasets'
    ? metasets.map((meta) => meta.name)
    : opRow.option.choices
  const opListTokens = opRow.option.control && LIST_VALUE_CONTROLS.has(opRow.option.control) && opListChoices
    ? parseTokenListValues(opRow.value, opListChoices)
    : null
  // gearsets gets the prefix-aware control (mutate `+`/`+-`/`-` support); a mixed or
  // unknown-name list still falls back to the validated text field, like other lists.
  const opGearsetEntries = opRow.option.control === 'gearsets' && opListChoices
    ? parsePrefixedTokenListValues(opRow.value, opListChoices)
    : null

  // A block with no assignments is invalid (the serializer rejects it — "selector
  // block has no operations" — which blocks Apply). Flag it so the add-operation
  // button reads as the required next action instead of an ordinary control.
  const needsOperation = block.operations.length === 0

  // Domain-preserving selector commit (keeps the discriminated union intact).
  const commitSelector = useCallback((selector: AnyOverridesSelector) => {
    if (block.domain === 'recipe') onChange({ ...block, selector: selector as RecipeOverridesSelector })
    else onChange({ ...block, selector: selector as NoteTagSelector })
  }, [block, onChange])

  const commitFlat = useCallback((flat: FlatSelector) => {
    const selector = buildSelectorFromFlat(flat)
    if (selector) commitSelector(selector)
  }, [commitSelector])

  const updateTerm = useCallback((index: number, term: FlatSelectorTerm) => {
    if (visualFlat) commitFlat({ ...visualFlat, terms: visualFlat.terms.map((entry, i) => (i === index ? term : entry)) })
  }, [commitFlat, visualFlat])

  const removeTerm = useCallback((index: number) => {
    if (!visualFlat) return
    const terms = visualFlat.terms.filter((_, i) => i !== index)
    // Dropping row N also drops the gap before it (the first row drops gap 0).
    const connectives = visualFlat.connectives.filter((_, i) => i !== Math.max(0, index - 1))
    // A block always needs a selector — removing the last row resets to `all`.
    commitFlat(terms.length > 0
      ? { terms, connectives }
      : { terms: [{ negated: false, leaf: { kind: 'all' } }], connectives: [] })
  }, [commitFlat, visualFlat])

  const addTerm = useCallback(() => {
    if (!visualFlat) return
    commitFlat({
      terms: [...visualFlat.terms, { negated: false, leaf: { kind: 'all' } }],
      connectives: [...visualFlat.connectives, 'and'],
    })
  }, [commitFlat, visualFlat])

  const handleSelectorChange = useCallback((text: string) => {
    setSelectorText(text)
    const parsed = parseSelectorText(hostDomain, block.domain, text)
    setSelectorError(parsed === null)
    if (parsed !== null) commitSelector(parsed)
  }, [block.domain, commitSelector, hostDomain])

  const commitOperation = (): void => {
    const parsed = parseOperationText(hostDomain, block.domain, opRowText(opRow))
    setOpError(parsed === null)
    if (parsed === null) return
    const operations = [...block.operations]
    if (editIndex !== null && editIndex < operations.length) operations[editIndex] = parsed
    else operations.push(parsed)
    // Domain-preserving update keeps the discriminated union intact.
    onChange(block.domain === 'recipe'
      ? { ...block, operations: operations as RecipeOverridesOperation[] }
      : { ...block, operations: operations as SafeguardOverridesOperation[] })
    setOpRow({ ...opRow, value: seedOpValue(opRow.option) })
    setEditIndex(null)
  }

  const removeOperation = (index: number): void => {
    const operations = block.operations.filter((_, i) => i !== index)
    onChange(block.domain === 'recipe'
      ? { ...block, operations: operations as RecipeOverridesOperation[] }
      : { ...block, operations: operations as SafeguardOverridesOperation[] })
    if (editIndex === index) { setEditIndex(null); updateOpRow({ value: seedOpValue(opRow.option) }) }
  }

  // Load an existing op into the editor row (clicking its chip).
  const beginEditOperation = (index: number): void => {
    const matched = matchOperationTerm(block.domain, operationToText(block, index))
    if (!matched) return
    setOpRow({
      option: matched.option,
      star: matched.star,
      stat: matched.stat || (opStatKeys[0] ?? 'SPD'),
      op: matched.op,
      value: matched.value,
    })
    setEditIndex(index)
    setOpError(false)
  }

  return (
    // Subtle inset surface so each rule block reads as one unit inside the option card.
    // An empty block is invalid, so it gets a warning-tinted border + wash to read as
    // "unfinished" at a glance (semantic theme tokens — no magic colours).
    <Box sx={{
      border: '1px solid',
      borderColor: needsOperation ? 'warning.main' : 'divider',
      borderRadius: 1,
      p: 1.25,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      bgcolor: needsOperation
        ? (theme) => alpha(theme.palette.warning.main, ALPHA.a12)
        : 'background.default',
    }}>
      {/* Block header: caption, and/or connective, editor-mode toggle, remove. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', flexShrink: 0 }}>
          {t('noteOverridesEditorSelectorLabel')}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {dslMode ? (
          <Tooltip title={t('noteOverridesEditorStructuredToggle')}>
            <span>
              <IconButton size="small" disabled={!visualFlat} onClick={() => setDslMode(false)} aria-label={t('noteOverridesEditorStructuredToggle')}>
                <TuneIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        ) : (
          <Tooltip title={t('noteOverridesEditorRawToggle')}>
            <IconButton
              size="small"
              onClick={() => { setSelectorText(selectorToText(block)); setSelectorError(false); setDslMode(true) }}
              aria-label={t('noteOverridesEditorRawToggle')}
            >
              <CodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={t('noteOverridesEditorRemoveBlock')}>
          <IconButton size="small" onClick={onRemove} aria-label={t('noteOverridesEditorRemoveBlock')}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {dslMode ? (
        // Raw selector expression (`@` + validated DSL text) for exotic shapes,
        // rendered with the app's dynamic-overrides syntax highlighting.
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, mt: 0.75 }}>@</Typography>
          <DslHighlightedField
            value={selectorText}
            onChange={handleSelectorChange}
            singleLine
            error={selectorError}
            helperText={selectorError
              ? t('noteOverridesEditorSelectorInvalid', { fields: selectorFieldsFor(block.domain).join(', ') })
              : undefined}
            testId="overrides-editor-selector"
          />
        </Box>
      ) : (
        <>
          {visualFlat?.terms.map((term, index) => (
            // Rows are positional; the length suffix remounts rows after add/remove
            // so their local view state re-derives from the committed leaves.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <Fragment key={`${index}-${visualFlat.terms.length}`}>
              {index > 0 && (
                // One connective per GAP — mixed and/or reads exactly like the DSL,
                // with the grammar's own precedence (and binds before or).
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={visualFlat.connectives[index - 1]}
                  onChange={(_, value: 'and' | 'or' | null) => {
                    if (value) commitFlat({ ...visualFlat, connectives: visualFlat.connectives.map((c, i) => (i === index - 1 ? value : c)) })
                  }}
                  sx={{ alignSelf: 'flex-start', ml: 4 }}
                >
                  {NOTE_OVERRIDES_LOGIC_KEYWORDS.map((keyword) => (
                    <ToggleButton key={keyword} value={keyword} sx={{ px: 0.75, py: 0, textTransform: 'none', ...TERM_SELECT_SX }}>{keyword}</ToggleButton>
                  ))}
                </ToggleButtonGroup>
              )}
              <SelectorTermRow
                hostDomain={hostDomain}
                blockDomain={block.domain}
                negated={term.negated}
                leaf={term.leaf}
                knownTags={knownTags}
                substatColors={substatColors}
                onCommit={(next) => updateTerm(index, next)}
                onRemove={() => removeTerm(index)}
              />
            </Fragment>
          ))}
          <Box>
            <Button size="small" variant="text" startIcon={<AddIcon fontSize="small" />} onClick={addTerm} data-testid="overrides-editor-term-add">
              {t('noteOverridesEditorSelAddTerm')}
            </Button>
          </Box>
        </>
      )}
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
      {/* Persistent (not hover-only) call-to-action while the block has no assignment:
          the block above is invalid until one is added, so spell it out and point at
          the add button on the row below. */}
      {needsOperation && (
        // Testid on the callout so e2e targets this exact node instead of a whole-DOM
        // getByText walk — that walk crashes Firefox's text engine when it races this
        // Box unmounting (can't read ownerDocument.head of a mid-detach node).
        <Box data-testid="overrides-editor-op-required" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'warning.main' }}>
          <ArrowForwardIcon sx={{ fontSize: '1rem' }} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {t('noteOverridesEditorOperationRequired')}
          </Typography>
        </Box>
      )}
      {/* Add / edit one operation: field dropdown + typed value widgets, all
          live-validated through the real grammar (no free text unless the field
          genuinely has an open vocabulary). */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, flexWrap: 'wrap' }}>
        <Select
          value={opRow.option.id}
          onChange={(event) => {
            const option = opOptions.find((entry) => entry.id === event.target.value)
            if (option) updateOpRow({ option, op: '=', value: seedOpValue(option) })
          }}
          size="small"
          sx={{ minWidth: 130 }}
          aria-label={t('noteOverridesEditorOperationField')}
          data-testid="overrides-editor-op-field"
        >
          {opOptions.map((entry) => (
            // Localized concept label (compile-required), qualified for dotted families
            // and explicit details (minima's Any-rank fallback) — see conceptLabel.
            <MenuItem key={entry.id} value={entry.id}>{conceptLabel(t, entry)}</MenuItem>
          ))}
        </Select>
        {/* Star + stat pickers for the dotted field families — the app's own selects. */}
        {opRow.option.star && (
          <StarKeyPicker value={opRow.star} onChange={(star) => updateOpRow({ star })} />
        )}
        {opRow.option.stat && (
          <StatKeyPicker
            value={opRow.stat}
            onChange={(stat) => updateOpRow({ stat })}
            colorStatControls={colorStatControls}
            substatColors={substatColors}
          />
        )}
        {/* Comparison operator when the field supports more than plain '='. */}
        {opRow.option.ops.length > 1 && (
          <Select value={opRow.op} size="small" error={opError} onChange={(event) => updateOpRow({ op: event.target.value as '=' | '>=' | '<=' })} sx={TERM_SELECT_SX}>
            {opRow.option.ops.map((op) => <MenuItem key={op} value={op} sx={TERM_SELECT_SX}>{OP_GLYPH[op]}</MenuItem>)}
          </Select>
        )}
        {calcState !== null ? (
          // $value-capable field with a widget-representable expression → visual calc.
          <SliderValueCalcEditor calc={calcState} onText={(value) => updateOpRow({ value })} />
        ) : opRow.option.control && SINGLE_VALUE_CONTROLS.has(opRow.option.control) ? (
          // Rank/star/rarity values via the app's own selects (see SingleValueControl).
          <SingleValueControl
            control={opRow.option.control}
            choices={opRow.option.choices ?? []}
            valueLabelKeys={opRow.option.valueLabelKeys}
            value={opRow.value}
            onChange={(value) => updateOpRow({ value })}
            t={t}
          />
        ) : opRow.option.control === 'gearsets' && opGearsetEntries !== null ? (
          // Gear sets get the prefix-aware control: Replace/Modify mode toggle plus
          // per-entry `+` / `+-` / `-` chips (click to cycle; right-click a set = excluded).
          <GearsetsListValueControl
            entries={opGearsetEntries}
            onEntries={(next) => updateOpRow({ value: prefixedTokenListText(next) })}
          />
        ) : opRow.option.control && opListTokens !== null ? (
          // Token lists via the matching domain select (3×3 slot grid, factions,
          // colored substats, metasets, ranks, rarities).
          <ListValueControl
            control={opRow.option.control}
            tokens={opListTokens}
            onTokens={(tokens) => updateOpRow({ value: tokenListText(tokens) })}
            metasets={metasets}
            colorStatControls={colorStatControls}
            substatColors={substatColors}
          />
        ) : opRow.option.widget === 'enum' && opRow.option.choices ? (
          // Closed value set → dropdown (export=active, activation=off, rank=any…).
          <Select
            value={opRow.option.choices.includes(opRow.value) ? opRow.value : ''}
            onChange={(event) => updateOpRow({ value: event.target.value })}
            size="small"
            displayEmpty
            error={opError}
            sx={{ minWidth: 140, ...TERM_SELECT_SX }}
            aria-label={t('noteOverridesEditorOperationValue')}
            data-testid="overrides-editor-op-value-select"
          >
            <MenuItem value="" disabled>{t('noteOverridesEditorOperationValue')}</MenuItem>
            {opRow.option.choices.map((choice) => (
              <MenuItem key={choice} value={choice} sx={opRow.option.valueLabelKeys?.[choice] ? undefined : TERM_SELECT_SX}>
                {choiceLabel(t, opRow.option.valueLabelKeys, choice)}
              </MenuItem>
            ))}
          </Select>
        ) : opRow.option.widget === 'number' ? (
          <OverridesNumberField
            value={Number.parseFloat(opRow.value) || 0}
            onChange={(next) => updateOpRow({ value: String(next) })}
            ariaLabel={t('noteOverridesEditorOperationValue')}
            // Bounds/step mirror the field's apply-side clamp (metadata SSOT).
            min={opRow.option.range?.min}
            max={opRow.option.range?.max}
            step={opRow.option.range?.step ?? 1}
            width={96}
          />
        ) : opRow.option.widget === 'level' ? (
          // Level window: from–to milestone pickers (single level = same milestone).
          <LevelRangeValueEditor value={opRow.value} onText={(value) => updateOpRow({ value })} />
        ) : opRow.option.widget === 'list' && opRow.option.choices && parseTokenListValues(opRow.value, opRow.option.choices) !== null ? (
          // Token vocabulary → chip multi-select. Mutate-prefixed lists (+SPD,-ACC)
          // are not chip-representable and fall through to the validated text field.
          <Autocomplete
            multiple
            size="small"
            options={opRow.option.choices}
            value={parseTokenListValues(opRow.value, opRow.option.choices) ?? []}
            onChange={(_, values) => updateOpRow({ value: tokenListText(values) })}
            // Options and chips show the localized value labels (star ranks, rarities,
            // slots) while the committed tokens stay the DSL vocabulary.
            getOptionLabel={(choice) => choiceLabel(t, opRow.option.valueLabelKeys, String(choice))}
            sx={{ minWidth: 260, flex: 1 }}
            renderInput={(params) => (
              <TextField {...params} size="small" error={opError} label={t('noteOverridesEditorOperationValue')} />
            )}
            slotProps={{ chip: { size: 'small', sx: opRow.option.valueLabelKeys ? { fontSize: '0.75rem' } : { fontFamily: 'monospace', fontSize: '0.7rem' } } }}
          />
        ) : (
          // Open vocabulary (metasets, threshold tables, mutate lists): free text with
          // a grammar example as placeholder; validated on every keystroke.
          <TextField
            value={opRow.value}
            onChange={(event) => updateOpRow({ value: event.target.value })}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitOperation() } }}
            size="small"
            sx={{ minWidth: 220, flex: 1, ...DSL_INPUT_SX }}
            error={opError}
            placeholder={opRow.option.example}
            helperText={opError ? t('noteOverridesEditorOperationInvalid') : undefined}
          />
        )}
        {/* When the block still has no assignment, this `+` is the required next action:
            the warning callout above points here, and the button gets a matching filled
            warning circle so it reads as the CTA that resolves the error. */}
        <Tooltip title={t(needsOperation ? 'noteOverridesEditorOperationRequired' : 'noteOverridesEditorAddOperation')}>
          <span>
            <IconButton
              size="small"
              onClick={commitOperation}
              disabled={!opRow.value.trim() || opError}
              color={needsOperation ? 'warning' : 'default'}
              aria-label={t(needsOperation ? 'noteOverridesEditorOperationRequired' : 'noteOverridesEditorAddOperation')}
              data-testid="overrides-editor-op-add"
              sx={needsOperation ? {
                // Filled warning circle so an empty block's add button stands out as the
                // CTA (semantic theme token + the shared ALPHA scale — no magic numbers).
                bgcolor: (theme) => alpha(theme.palette.warning.main, ALPHA.a20),
                '&:hover': { bgcolor: (theme) => alpha(theme.palette.warning.main, ALPHA.a30) },
              } : undefined}
            >
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
  knownTags: string[]
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  onChange: (next: DraftStructuredBody) => void
}

function BlockSection({ hostDomain, section, header, body, knownTags, metasets, substatColors, onChange }: SectionProps): JSX.Element {
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
    // display:contents — the caption and button participate directly in the parent's
    // two-column grid, so every section's add button aligns to one shared column
    // (the grid's max-content caption column) instead of trailing its own caption.
    <Box sx={{ display: 'contents' }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.2 }}>{header}</Typography>
      <Box>
        <Button size="small" variant="text" startIcon={<AddIcon fontSize="small" />} onClick={add} sx={{ py: 0, minWidth: 0 }} data-testid={`overrides-editor-add-block-${section}`}>
          {t('noteOverridesEditorAddBlock')}
        </Button>
      </Box>
      {blocks.map((block, index) => (
        // Block rows span both grid columns beneath their section header.
        <Box
          // Same rationale as the op chips: blocks are positional, editing is keyed by slot.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={`${section}-${index}`}
          sx={{ gridColumn: '1 / -1' }}
        >
          <BlockRowEditor
            hostDomain={hostDomain}
            block={block}
            knownTags={knownTags}
            metasets={metasets}
            substatColors={substatColors}
            onChange={(next) => updateAt(index, next)}
            onRemove={() => removeAt(index)}
          />
        </Box>
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
      <DslHighlightedField
        value={text}
        onChange={onChange}
        minRows={2}
        error={diagnostics.length > 0}
        label={t('noteOverridesEditorRawToggle')}
        helperText={diagnostics.length > 0 ? diagnostics[0]!.message : t('noteOverridesEditorRawHelper')}
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

export function EffectBodyBuilder({ hostDomain, body, onChange, knownTags, metasets, substatColors }: EffectBodyBuilderProps): JSX.Element {
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
    // Two-column grid: captions share one max-content column, so all four sections'
    // add buttons line up vertically regardless of caption length. Section block
    // rows and the divider span both columns.
    <Box sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 1.5, rowGap: 1, alignItems: 'center' }}>
      {/* When-selected sections: same-domain blocks, then cross-domain blocks. */}
      <BlockSection hostDomain={hostDomain} section="blocks" header={t('noteOverridesEditorEffectsHeader')} body={body} knownTags={knownTags} metasets={metasets} substatColors={substatColors} onChange={onChange} />
      <BlockSection hostDomain={hostDomain} section="crossBlocks" header={t(crossHeaderKey(hostDomain))} body={body} knownTags={knownTags} metasets={metasets} substatColors={substatColors} onChange={onChange} />
      <Divider flexItem sx={{ gridColumn: '1 / -1' }} />
      {/* Else sections: applied while the option is NOT selected. */}
      <BlockSection hostDomain={hostDomain} section="elseBlocks" header={t('noteOverridesEditorEffectsElse')} body={body} knownTags={knownTags} metasets={metasets} substatColors={substatColors} onChange={onChange} />
      <BlockSection hostDomain={hostDomain} section="crossElseBlocks" header={`${t('noteOverridesEditorEffectsElse')} — ${t(crossHeaderKey(hostDomain))}`} body={body} knownTags={knownTags} metasets={metasets} substatColors={substatColors} onChange={onChange} />
      <Box sx={{ gridColumn: '1 / -1' }}>
        <Button size="small" variant="text" startIcon={<CodeIcon fontSize="small" />} onClick={switchToRaw}>
          {t('noteOverridesEditorRawToggle')}
        </Button>
      </Box>
    </Box>
  )
}
