import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Tooltip, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import { FONT_SIZE_MARKDOWN_PX, FONT_SIZE_SECONDARY_PX } from '../lib/constants'
import MDEditor from '@uiw/react-md-editor'
import type { ICommand, RefMDEditor } from '@uiw/react-md-editor'
import { getCommands } from '@uiw/react-md-editor'
import rehypeSanitize from 'rehype-sanitize'
import { defaultSchema } from 'hast-util-sanitize'
import type { Schema } from 'hast-util-sanitize'
import type { Pluggable } from 'unified'
import type { Components } from 'react-markdown'
import type { Root, RootContent, Element } from 'hast'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { metasetGlyph } from '../lib/metasets'
import { metasetIconOptionById, DEFAULT_METASET_ICON_ID, type MetasetIconId } from '../lib/metasetIcons'
import { artifactSetNames, compareArtifactSets } from '../lib/types'
import ConfigChip from './ConfigChip'

// Limited color palette for Note highlighting rendered from Markdown via
//   <span data-color="{name}">…</span>
// Kept intentionally small and named. Sanitizer below permits only the data-color attribute on span.
const NOTE_COLOR_HEX: Record<'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'gray', string> = {
  red: '#ef5350',
  orange: '#ffa726',
  yellow: '#ffeb3b',
  green: '#66bb6a',
  teal: '#26a69a',
  blue: '#42a5f5',
  purple: '#ab47bc',
  gray: '#90a4ae',
}
const NOTE_COLOR_SX_SELECTORS: Record<string, { color: string }> = Object.fromEntries(
  (Object.entries(NOTE_COLOR_HEX) as Array<[keyof typeof NOTE_COLOR_HEX, string]>).map(([name, hex]) => [
    `& [data-color="${name}"]`,
    { color: hex },
  ]),
)
const NOTE_EDITOR_BG_COLOR = '#0d1117'

const CONFIG_COMMENT_REGEX = /^\s*configs\s*:\s*([0-9,\s]+)\s*$/i
const CONFIG_MARKER_REGEX = /<!--\s*configs\s*:\s*([0-9,\s]+)\s*-->/i
const CONFIG_REGEX_COMMENT_REGEX = /^\s*configs-re\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*$/i
const CONFIG_REGEX_MARKER_REGEX = /<!--\s*configs-re\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*-->/i
const CONFIG_ANY_MARKER_GLOBAL_REGEX = /<!--\s*configs(?:-re)?\s*:[\s\S]*?-->/gi
const CONFIG_ELEMENT_TAG = 'config-chip-block'
const CONFIG_ELEMENT_ATTR = 'data-config-ids'
const CONFIG_ELEMENT_PATTERN_ATTR = 'data-config-pattern'
const CONFIG_ELEMENT_FILTER_ATTR = 'data-config-filter'
const CONFIG_ELEMENT_INDEX_ATTR = 'data-config-marker-index'
const CONFIG_FILTER_IDS = 'ids'
const CONFIG_FILTER_REGEXP = 'regexp'
const DEFAULT_ALLOWED_TAG_REGEX = /^[A-Za-z0-9]+$/

// Defensive guard: reject control characters that would break markdown parsing or regex compilation.
function containsControlCharacters(value: string): boolean {
  for (let idx = 0; idx < value.length; idx += 1) {
    const code = value.charCodeAt(idx)
    if ((code >= 0 && code <= 31) || code === 127) {
      return true
    }
  }
  return false
}

function decodeNotePattern(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`)
  } catch {
    return raw
  }
}

function buildNotePattern(raw: string): RegExp | null {
  const decoded = decodeNotePattern(raw).trim()
  if (!decoded) return null
  if (containsControlCharacters(decoded)) return null
  try {
    return new RegExp(decoded, 'iu')
  } catch {
    return null
  }
}

type ConfigMarkerEntry = { id: number; cfg: BuilderConfig }
type ConfigMarkerMap = Map<number, ConfigMarkerEntry[]>

type NoteRenderContextValue = {
  configs: BuilderConfig[]
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  markerResolutions: ConfigMarkerMap
}

const NoteRenderContext = React.createContext<NoteRenderContextValue | null>(null)

function useNoteRenderContext(): NoteRenderContextValue {
  const ctx = React.useContext(NoteRenderContext)
  if (!ctx) throw new Error('Note render context is unavailable')
  return ctx
}

type MarkdownComponentMap = Record<string, React.ComponentType<Record<string, unknown>>>
type MarkdownAllowElement = NonNullable<React.ComponentProps<typeof MDEditor.Markdown>['allowElement']>

type ConfigMarkerToken =
  | { type: 'absolute'; value: number }
  | { type: 'relativeNext' }

function coerceFirstString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') return entry
    }
  }
  return null
}

function parseConfigTokens(raw: string): ConfigMarkerToken[] {
  const tokens: ConfigMarkerToken[] = []
  const seen = new Set<number>()
  raw
    .split(',')
    .map((part) => part.trim())
    .forEach((part) => {
      if (!part) return
      const num = Number.parseInt(part, 10)
      if (!Number.isFinite(num)) return
      if (num === 0) {
        tokens.push({ type: 'relativeNext' })
        return
      }
      if (num > 0 && !seen.has(num)) {
        tokens.push({ type: 'absolute', value: num })
        seen.add(num)
      }
    })
  return tokens
}

function serializeConfigTokens(tokens: ConfigMarkerToken[]): string {
  return tokens.map((token) => (token.type === 'relativeNext' ? '0' : String(token.value))).join(',')
}

const rehypeConfigComments: Pluggable = () => {
  return (tree: Root) => {
    let markerIndex = 0
    const transform = (node: Root | Element): void => {
      const nodeChildren = (node.children ?? []) as RootContent[]
      for (let i = 0; i < nodeChildren.length; i++) {
        const child = nodeChildren[i]
        if (!child) continue
        if (child.type === 'comment') {
          const value = (child as { value: string }).value
          const regexMatch = CONFIG_REGEX_COMMENT_REGEX.exec(value)
          if (regexMatch) {
            const patternRaw = regexMatch[1] ?? ''
            const element: Element = {
              type: 'element',
              tagName: CONFIG_ELEMENT_TAG,
              properties: {
                [CONFIG_ELEMENT_FILTER_ATTR]: CONFIG_FILTER_REGEXP,
                [CONFIG_ELEMENT_PATTERN_ATTR]: patternRaw,
                [CONFIG_ELEMENT_INDEX_ATTR]: String(markerIndex),
              },
              children: [],
            }
            markerIndex += 1
            nodeChildren.splice(i, 1, element)
            continue
          }
          const match = CONFIG_COMMENT_REGEX.exec(value)
          if (!match) continue
          const tokens = parseConfigTokens(match[1] ?? '')
          if (tokens.length === 0) {
            nodeChildren.splice(i, 1)
            i -= 1
            continue
          }
          const element: Element = {
            type: 'element',
            tagName: CONFIG_ELEMENT_TAG,
            properties: {
              [CONFIG_ELEMENT_FILTER_ATTR]: CONFIG_FILTER_IDS,
              [CONFIG_ELEMENT_ATTR]: serializeConfigTokens(tokens),
              [CONFIG_ELEMENT_INDEX_ATTR]: String(markerIndex),
            },
            children: [],
          }
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        if (child.type === 'raw') {
          const value = (child as { value: string }).value
          const regexMatch = CONFIG_REGEX_MARKER_REGEX.exec(value)
          if (regexMatch) {
            const patternRaw = regexMatch[1] ?? ''
            const element: Element = {
              type: 'element',
              tagName: CONFIG_ELEMENT_TAG,
              properties: {
                [CONFIG_ELEMENT_FILTER_ATTR]: CONFIG_FILTER_REGEXP,
                [CONFIG_ELEMENT_PATTERN_ATTR]: patternRaw,
                [CONFIG_ELEMENT_INDEX_ATTR]: String(markerIndex),
              },
              children: [],
            }
            markerIndex += 1
            nodeChildren.splice(i, 1, element)
            continue
          }
          const match = CONFIG_MARKER_REGEX.exec(value)
          if (!match) continue
          const tokens = parseConfigTokens(match[1] ?? '')
          if (tokens.length === 0) {
            nodeChildren.splice(i, 1)
            i -= 1
            continue
          }
          const element: Element = {
            type: 'element',
            tagName: CONFIG_ELEMENT_TAG,
            properties: {
              [CONFIG_ELEMENT_FILTER_ATTR]: CONFIG_FILTER_IDS,
              [CONFIG_ELEMENT_ATTR]: serializeConfigTokens(tokens),
              [CONFIG_ELEMENT_INDEX_ATTR]: String(markerIndex),
            },
            children: [],
          }
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        if ((child as Element).type === 'element' && Array.isArray((child as Element).children)) {
          transform(child as unknown as Element)
        }
      }
    }
    transform(tree)
  }
}

function collectConfigIds(text: string, configs: BuilderConfig[]): Set<number> {
  const used = new Set<number>()
  const resolutions = buildConfigMarkerResolutions(text, configs)
  for (const entries of resolutions.values()) {
    for (const entry of entries) {
      used.add(entry.id)
    }
  }
  return used
}

function buildConfigMarkerResolutions(text: string, configs: BuilderConfig[]): ConfigMarkerMap {
  const result: ConfigMarkerMap = new Map()
  if (!text) return result
  CONFIG_ANY_MARKER_GLOBAL_REGEX.lastIndex = 0
  let markerIndex = 0
  let lastRendered = 0
  for (const match of text.matchAll(CONFIG_ANY_MARKER_GLOBAL_REGEX)) {
    const raw = match?.[0] ?? ''
    if (!raw) {
      markerIndex += 1
      continue
    }
    let entries: ConfigMarkerEntry[] = []
    const regexMatch = CONFIG_REGEX_MARKER_REGEX.exec(raw)
    if (regexMatch) {
      const patternRaw = regexMatch[1] ?? ''
      const compiled = buildNotePattern(patternRaw)
      if (compiled) {
        const safeCompiled = compiled
        entries = configs
          .map((cfg, idx) => ({ cfg, idx }))
          .filter(({ cfg }) => {
            const name = typeof cfg?.name === 'string' ? cfg.name : ''
            safeCompiled.lastIndex = 0
            return safeCompiled.test(name)
          })
          .map(({ cfg, idx }) => ({ id: idx + 1, cfg }))
      }
    } else {
      const idsMatch = CONFIG_MARKER_REGEX.exec(raw)
      if (idsMatch && typeof idsMatch[1] === 'string') {
        const tokens = parseConfigTokens(idsMatch[1])
        if (tokens.length > 0) {
          const fallback: ConfigMarkerEntry[] = []
          let markerLast = lastRendered
          for (const token of tokens) {
            let candidate: number | null = null
            if (token.type === 'absolute') {
              candidate = token.value
            } else {
              candidate = markerLast + 1
            }
            if (!candidate || candidate <= 0) continue
            const cfg = configs[candidate - 1]
            if (!cfg) continue
            fallback.push({ id: candidate, cfg })
            markerLast = candidate
          }
          entries = fallback
        }
      }
    }
    if (entries.length > 0) {
      lastRendered = entries[entries.length - 1]!.id
    }
    result.set(markerIndex, entries)
    markerIndex += 1
  }
  return result
}

function buildConfigMarker(ids: number[]): string {
  return `<!-- configs:${ids.join(',')} -->`
}

function computeBlockInsertion(
  text: string,
  start: number,
  end: number,
  block: string,
): { insert: string; cursorOffset: number } {
  const before = text.slice(0, start)
  const after = text.slice(end)
  const needsLeading = before.length > 0 && !before.endsWith('\n')
  const needsTrailing = after.length > 0 && !after.startsWith('\n')
  const leading = needsLeading ? (before.endsWith('\n\n') ? '' : '\n\n') : (start === 0 ? '' : '\n')
  const trailing = needsTrailing ? '\n\n' : (after.length === 0 ? '\n' : '')
  const insert = `${leading}${block}${trailing}`
  const cursorOffset = insert.length - (trailing.length > 0 ? trailing.length : 0)
  return { insert, cursorOffset }
}

function buildMetasetBulletList(
  metasets: Metaset[],
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (!metasets.length) return ''
  const fallbackIconOption = metasetIconOptionById(DEFAULT_METASET_ICON_ID)
  return metasets
    .map((meta) => {
      const glyphInfo = metasetGlyph(meta)
      let iconGlyph: string | null = null
      if (glyphInfo.iconId === 'none') {
        iconGlyph = null
      } else if (glyphInfo.glyph) {
        iconGlyph = glyphInfo.glyph
      } else if (glyphInfo.iconId) {
        const option = metasetIconOptionById(glyphInfo.iconId as MetasetIconId)
        iconGlyph = option.variant === 'none' ? null : option.glyph
      } else if (typeof meta.iconId === 'string') {
        const option = metasetIconOptionById(meta.iconId as MetasetIconId)
        iconGlyph = option.variant === 'none' ? null : option.glyph
      }
      if (!iconGlyph && fallbackIconOption.variant !== 'none') {
        iconGlyph = fallbackIconOption.glyph
      }
      const setNames = (meta.sets ?? [])
        .slice()
        .sort((a, b) => compareArtifactSets(Number(a), Number(b)))
        .map((id) => artifactSetNames[Number(id)] ?? String(id))
      const setsLabel = setNames.length > 0 ? setNames.join(', ') : t('noteMetasetNoSets')
      const iconPart = iconGlyph ? `${iconGlyph} ` : ''
      const name = meta.name && meta.name.trim() ? meta.name.trim() : t('menuMetasetsSection')
      return `- ${iconPart}**${name}** - ${setsLabel}.`
    })
    .join('\n')
}

type ConfigChipBlockProps = React.PropsWithChildren<{ node?: Element & { properties?: Record<string, unknown> } }>

function ConfigChipBlock({ node }: ConfigChipBlockProps): JSX.Element | null {
  const { configs, metasets, substatColors, markerResolutions } = useNoteRenderContext()
  const filterAttr = coerceFirstString(node?.properties?.[CONFIG_ELEMENT_FILTER_ATTR])
  const filterType = filterAttr === CONFIG_FILTER_REGEXP ? CONFIG_FILTER_REGEXP : CONFIG_FILTER_IDS
  let tokens: ConfigMarkerToken[] = []
  let patternRaw = ''
  if (filterType === CONFIG_FILTER_IDS) {
    const rawSpec = coerceFirstString(node?.properties?.[CONFIG_ELEMENT_ATTR]) ?? ''
    tokens = parseConfigTokens(rawSpec)
    if (tokens.length === 0) return null
  } else {
    patternRaw = coerceFirstString(node?.properties?.[CONFIG_ELEMENT_PATTERN_ATTR]) ?? ''
  }
  const rawIndexAttr = coerceFirstString(node?.properties?.[CONFIG_ELEMENT_INDEX_ATTR])
  let markerIndex: number | null = null
  if (rawIndexAttr) {
    const parsed = Number.parseInt(rawIndexAttr, 10)
    if (Number.isFinite(parsed)) markerIndex = parsed
  }
  let resolvedEntries: ConfigMarkerEntry[] | undefined
  if (markerIndex != null) {
    resolvedEntries = markerResolutions.get(markerIndex)
  }
  if (!resolvedEntries) {
    if (filterType === CONFIG_FILTER_REGEXP) {
      const compiled = buildNotePattern(patternRaw)
      if (compiled) {
        const safeCompiled = compiled
        resolvedEntries = configs
          .map((cfg, idx) => ({ cfg, idx }))
          .filter(({ cfg }) => {
            const name = typeof cfg?.name === 'string' ? cfg.name : ''
            safeCompiled.lastIndex = 0
            return safeCompiled.test(name)
          })
          .map(({ cfg, idx }) => ({ id: idx + 1, cfg }))
      } else {
        resolvedEntries = []
      }
    } else {
      let priorLast = 0
      if (markerIndex != null) {
        for (let idx = markerIndex - 1; idx >= 0; idx -= 1) {
          const prev = markerResolutions.get(idx)
          if (prev && prev.length > 0) {
            priorLast = prev[prev.length - 1]!.id
            break
          }
        }
      }
      const fallbackEntries: ConfigMarkerEntry[] = []
      let markerLast = priorLast
      for (const token of tokens) {
        let candidate: number | null = null
        if (token.type === 'absolute') {
          candidate = token.value
        } else {
          candidate = markerLast + 1
        }
        if (!candidate || candidate <= 0) continue
        const cfg = configs[candidate - 1]
        if (!cfg) continue
        fallbackEntries.push({ id: candidate, cfg })
        markerLast = candidate
      }
      resolvedEntries = fallbackEntries
    }
  }
  const entries = resolvedEntries ?? []
  if (entries.length === 0) return null
  const noop = () => {}
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, my: 1 }}>
      {entries.map(({ id, cfg }, idx) => (
        <Box
          key={`note-cfg-${id}`}
          sx={{
            pointerEvents: 'none',
            width: '100%',
            '& .MuiIconButton-root': { display: 'none !important' },
          }}
        >
          <ConfigChip
            index={id - 1}
            cfg={cfg}
            onDelete={noop}
            onDuplicate={noop}
            onMoveUp={noop}
            onMoveDown={noop}
            onMoveTop={noop}
            onMoveBottom={noop}
            onPasteAfter={noop}
            selected={false}
            onSelect={noop}
            onCopy={noop}
            isLast={idx === entries.length - 1}
            // Render static builder-style chips so README notes match the in-app visuals.
            visualVariant="static"
            linkedHover={false}
            onHover={noop}
            metasets={metasets}
            substatColors={substatColors}
          />
        </Box>
      ))}
    </Box>
  )
}

export default function NoteDialog({
  open,
  mode,
  note,
  onChange,
  onClose,
  configs,
  metasets,
  substatColors,
}: {
  open: boolean
  mode: 'view' | 'edit'
  note: string
  onChange: (value: string) => void
  onClose: () => void
  configs: BuilderConfig[]
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
}) {
  const { t } = useI18n()
  const editCommitRef = useRef<() => void>(() => onClose())
  const markerResolutions = useMemo(() => buildConfigMarkerResolutions(note ?? '', configs), [note, configs])
  const contextValue = useMemo<NoteRenderContextValue>(
    () => ({ configs, metasets, substatColors, markerResolutions }),
    [configs, metasets, substatColors, markerResolutions],
  )
  const allowMarkdownElement = React.useCallback<MarkdownAllowElement>((element) => {
    const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
    if (tag === CONFIG_ELEMENT_TAG) return true
    return DEFAULT_ALLOWED_TAG_REGEX.test(tag)
  }, [])
  // Memoized sanitize schema and plugins for performance during typing.
  type Primitive = string | number | boolean | RegExp | null | undefined
  type SanitizeProp = string | [string, ...Primitive[]]
  const sanitizeSchema: Schema = useMemo(() => {
    const baseAttrs = (defaultSchema.attributes ?? {}) as Record<string, SanitizeProp[]>
    const spanAttrs: SanitizeProp[] = Array.isArray(baseAttrs.span) ? baseAttrs.span : []
    const configAttrs: SanitizeProp[] = Array.isArray(baseAttrs[CONFIG_ELEMENT_TAG]) ? baseAttrs[CONFIG_ELEMENT_TAG] : []
    const mergedConfigAttrs = Array.from(new Set<SanitizeProp>([
      ...configAttrs,
      CONFIG_ELEMENT_ATTR,
      CONFIG_ELEMENT_PATTERN_ATTR,
      CONFIG_ELEMENT_FILTER_ATTR,
      CONFIG_ELEMENT_INDEX_ATTR,
    ]))
    return {
      ...defaultSchema,
      attributes: {
        ...defaultSchema.attributes,
        span: [...spanAttrs, 'data-color', 'dataColor'],
        [CONFIG_ELEMENT_TAG]: mergedConfigAttrs,
      },
      tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), 'span', CONFIG_ELEMENT_TAG])),
    }
  }, [])
  const rehypePluginsSafe = useMemo<Pluggable[]>(() => (
    [
      rehypeConfigComments,
      [rehypeSanitize, sanitizeSchema] as unknown as Pluggable,
    ]
  ), [sanitizeSchema])
  const markdownComponents = useMemo<MarkdownComponentMap>(() => ({
    [CONFIG_ELEMENT_TAG]: ConfigChipBlock as unknown as React.ComponentType<Record<string, unknown>>,
  }), [])

  // Color toolbar command and full commands list; injected before HR.
  const colorCommand: ICommand = useMemo(() => ({
    name: 'color',
    keyCommand: 'group',
    groupName: 'color',
    buttonProps: { 'aria-label': t('mdColor') },
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" role="img" aria-label="Color">
        <circle cx="6" cy="6" r="5" fill="#42a5f5" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
    children: (handle) => (
      <div style={{ display: 'flex', gap: 6, padding: '6px 8px', maxWidth: 220, flexWrap: 'wrap' }}>
        {(Object.keys(NOTE_COLOR_HEX) as Array<keyof typeof NOTE_COLOR_HEX>).map((c) => (
          <Tooltip key={c} title={t('noteColorTooltip', { name: String(c) })} placement="bottom" disableInteractive>
            <button
              type="button"
              aria-label={`${t('mdColor')} ${String(c)}`}
              onClick={() => {
              const state = handle.getState?.()
              const selected = state && state.selectedText ? state.selectedText : 'text'
              const selStart = state && state.selection ? state.selection.start : 0
              const open = `<span data-color="${String(c)}">`
              const close = '</span>'
              const api = handle.textApi
              if (api) {
                api.replaceSelection(open + selected + close)
                // After wrapping, place selection inside the span (around original text)
                api.setSelectionRange({ start: selStart + open.length, end: selStart + open.length + selected.length })
              }
              handle.close()
              }}
              style={{ width: 18, height: 18, borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, backgroundColor: NOTE_COLOR_HEX[c] }} />
            </button>
          </Tooltip>
        ))}
      </div>
    ),
  }), [t])
  const toolbarCommands = useMemo(() => {
    const base = getCommands()
    const idxHr = base.findIndex((c) => c.keyCommand === 'hr')
    const insertAt = idxHr >= 0 ? idxHr : base.length
    const arr = base.slice()
    arr.splice(insertAt, 0, colorCommand)
    return arr
  }, [colorCommand])

  useEffect(() => {
    if (mode !== 'edit') editCommitRef.current = () => onClose()
  }, [mode, onClose])

  const handleDialogClose = React.useCallback(() => {
    try { editCommitRef.current() } catch { onClose() }
  }, [onClose])

  return (
    <NoteRenderContext.Provider value={contextValue}>
      <Dialog
        open={open}
        onClose={handleDialogClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { maxHeight: '84vh' } }}
      >
      <DialogTitle>{t('noteTitle')}</DialogTitle>
      {mode === 'view'
        ? (
          <>
            <DialogContent dividers>
              <Box
                data-allow-select={1 as const}
                data-allow-context={1 as const}
                data-color-mode={('dark' as const)}
                sx={{
                  bgcolor: NOTE_EDITOR_BG_COLOR,
                  borderRadius: 1,
                  px: 2,
                  py: 2,
                  '& .wmde-markdown': { bgcolor: 'transparent', fontSize: FONT_SIZE_MARKDOWN_PX, lineHeight: 1.7 },
                  ...NOTE_COLOR_SX_SELECTORS,
                }}
              >
                <MDEditor.Markdown
                  source={note ?? ''}
                  rehypePlugins={rehypePluginsSafe as unknown as NonNullable<React.ComponentProps<typeof MDEditor.Markdown>['rehypePlugins']>}
                  components={markdownComponents as unknown as Components}
                  allowElement={allowMarkdownElement}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={onClose}>{t('close')}</Button>
            </DialogActions>
          </>
        )
        : (
          <NoteEditorContent
            note={note}
            t={t}
            rehypePluginsSafe={rehypePluginsSafe}
            toolbarCommands={toolbarCommands}
            onChange={onChange}
            onClose={onClose}
            registerCommit={(fn) => { editCommitRef.current = fn }}
            configs={configs}
            metasets={metasets}
            markdownComponents={markdownComponents}
            allowElement={allowMarkdownElement}
          />
        )}
      </Dialog>
    </NoteRenderContext.Provider>
  )
}

function NoteEditorContent({
  note,
  t,
  rehypePluginsSafe,
  toolbarCommands,
  onChange,
  onClose,
  registerCommit,
  configs,
  metasets,
  markdownComponents,
  allowElement,
}: {
  note: string
  t: ReturnType<typeof useI18n>['t']
  rehypePluginsSafe: Pluggable[]
  toolbarCommands: ICommand[]
  onChange: (value: string) => void
  onClose: () => void
  registerCommit: (fn: () => void) => void
  configs: BuilderConfig[]
  metasets: Metaset[]
  markdownComponents: MarkdownComponentMap
  allowElement: MarkdownAllowElement
}) {
  const editWrapRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<RefMDEditor | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [draft, setDraft] = useState<string>(note ?? '')
  const baseContext = useNoteRenderContext()
  const editorMarkerResolutions = useMemo(() => buildConfigMarkerResolutions(draft ?? '', configs), [draft, configs])
  const editorContextValue = useMemo<NoteRenderContextValue>(
    () => ({ ...baseContext, markerResolutions: editorMarkerResolutions }),
    [baseContext, editorMarkerResolutions],
  )

  const commitAndClose = React.useCallback(() => {
    try { onChange(draft) } catch {}
    onClose()
  }, [draft, onChange, onClose])

  registerCommit(commitAndClose)

  const configCommand = useMemo<ICommand>(() => ({
    name: 'insert-configs',
    keyCommand: 'insert-configs',
    execute: (state, api) => {
      if (!configs.length) return
      const text = state.text ?? ''
      const allIds = configs.map((_, idx) => idx + 1)
      const usedIds = collectConfigIds(text, configs)
      const missing = allIds.filter((id) => !usedIds.has(id))
      const markerIds = missing.length ? missing : allIds
      if (!markerIds.length) return
      const marker = buildConfigMarker(markerIds)
      const start = state.selection?.start ?? 0
      const end = state.selection?.end ?? start
      const { insert, cursorOffset } = computeBlockInsertion(text, start, end, marker)
      const nextState = api.replaceSelection(insert)
      const nextPos = start + cursorOffset
      api.setSelectionRange({ start: nextPos, end: nextPos })
      setDraft(nextState.text)
    },
  }), [configs, setDraft])

  const metasetCommand = useMemo<ICommand>(() => ({
    name: 'insert-metasets',
    keyCommand: 'insert-metasets',
    execute: (state, api) => {
      if (metasets.length === 0) return
      const block = buildMetasetBulletList(metasets, t)
      if (!block) return
      const text = state.text ?? ''
      const start = state.selection?.start ?? 0
      const end = state.selection?.end ?? start
      const { insert, cursorOffset } = computeBlockInsertion(text, start, end, block)
      const nextState = api.replaceSelection(insert)
      const nextPos = start + cursorOffset
      api.setSelectionRange({ start: nextPos, end: nextPos })
      setDraft(nextState.text)
    },
  }), [metasets, t, setDraft])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const ta = editWrapRef.current?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
        ta?.focus()
      } catch {}
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const flush = () => {
      try { onChange(draft) } catch {}
    }
    const onVis = () => { if (document.hidden) flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [draft, onChange])

  const executeCustomCommand = React.useCallback((command: ICommand) => {
    const editor = editorRef.current
    if (!editor?.commandOrchestrator) return
    editor.commandOrchestrator.executeCommand(command, editor.dispatch, {
      fullscreen: Boolean(editor.fullscreen),
      preview: editor.preview ?? 'live',
      highlightEnable: editor.highlightEnable ?? true,
    })
  }, [])

  const handleInsertConfigChips = React.useCallback(() => {
    executeCustomCommand(configCommand)
  }, [executeCustomCommand, configCommand])

  const handleInsertMetasetsList = React.useCallback(() => {
    executeCustomCommand(metasetCommand)
  }, [executeCustomCommand, metasetCommand])

  return (
    <>
      <DialogContent dividers>
        {/* Match the markdown editor chrome to the dark preview so text stays legible in edit mode. */}
        <Box
          ref={editWrapRef}
          data-allow-select={1 as const}
          data-allow-context={1 as const}
          data-color-mode={('dark' as const)}
          sx={{
            '& .w-md-editor': {
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px`,
              backgroundColor: `${NOTE_EDITOR_BG_COLOR} !important`,
              color: (theme) => `${theme.palette.text.primary} !important`,
            },
            '& .w-md-editor .w-md-editor-text': {
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px !important`,
              lineHeight: '1.7 !important',
              backgroundColor: `${NOTE_EDITOR_BG_COLOR} !important`,
              color: (theme) => `${theme.palette.text.primary} !important`,
            },
            '& .w-md-editor .w-md-editor-text-pre': {
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px !important`,
              lineHeight: '1.7 !important',
              backgroundColor: `${NOTE_EDITOR_BG_COLOR} !important`,
              color: (theme) => `${theme.palette.text.primary} !important`,
            },
            '& .w-md-editor .w-md-editor-text-pre code': { fontSize: `${FONT_SIZE_MARKDOWN_PX}px !important`, lineHeight: '1.7 !important' },
            '& .w-md-editor .w-md-editor-text-input': {
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px`,
              lineHeight: 1.7,
              backgroundColor: 'transparent',
              color: 'inherit',
              borderColor: (theme) => theme.palette.divider,
              caretColor: (theme) => theme.palette.text.primary,
            },
            '& .w-md-editor .w-md-editor-content': { backgroundColor: `${NOTE_EDITOR_BG_COLOR} !important` },
            '& .w-md-editor .w-md-editor-preview': {
              backgroundColor: `${NOTE_EDITOR_BG_COLOR} !important`,
              color: (theme) => `${theme.palette.text.primary} !important`,
            },
            '& .wmde-markdown': {
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px`,
              lineHeight: 1.7,
              color: (theme) => `${theme.palette.text.primary} !important`,
            },
            '& .w-md-editor .w-md-editor-toolbar': { padding: '6px' },
            '& .w-md-editor .w-md-editor-toolbar li': { fontSize: `${FONT_SIZE_SECONDARY_PX}px` },
            '& .w-md-editor .w-md-editor-toolbar li button': {
              height: '30px',
              lineHeight: '22px',
              padding: '6px 8px',
              margin: '0 2px',
              borderRadius: '4px',
            },
            '& .w-md-editor .w-md-editor-toolbar li button svg': { width: 18, height: 18 },
            '& .w-md-editor .w-md-editor-toolbar-divider': { height: '18px', margin: '-3px 6px 0 6px !important' },
            ...NOTE_COLOR_SX_SELECTORS,
          }}
          onMouseDownCapture={(e) => {
            try {
              const root = editWrapRef.current
              const ta = root?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
              if (!ta) return
              const target = e.target as HTMLElement | null
              const inToolbar = Boolean(target && target.closest('.w-md-editor-toolbar'))
              if (!inToolbar) return
              const selStart = ta.selectionStart ?? 0
              const selEnd = ta.selectionEnd ?? selStart
              if (selEnd <= selStart) return
              const text = ta.value
              let s = selStart
              let t = selEnd
              const isWs = (ch: string) => /\s/.test(ch)
              while (s < t && isWs(text.charAt(s))) s++
              while (t > s && isWs(text.charAt(t - 1))) t--
              if (s !== selStart || t !== selEnd) {
                try { ta.setSelectionRange(s, t) } catch {}
              }
            } catch {}
          }}
          onMouseDown={(e) => {
            try {
              const root = editWrapRef.current
              const ta = root?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
              if (!ta) return
              const target = e.target as HTMLElement | null
              const inToolbar = Boolean(target && target.closest('.w-md-editor-toolbar'))
              if (inToolbar) return
              window.setTimeout(() => {
                if (document.activeElement !== ta) ta.focus()
                if (!(e.target instanceof HTMLTextAreaElement)) {
                  const len = ta.value.length
                  try { ta.setSelectionRange(len, len) } catch {}
                }
              }, 0)
            } catch {}
          }}
        >
          {(() => (
            <NoteRenderContext.Provider value={editorContextValue}>
              <MDEditor
                ref={editorRef}
                value={draft}
                onChange={(v) => setDraft(v ?? '')}
                previewOptions={{
                  rehypePlugins: rehypePluginsSafe,
                  components: markdownComponents as unknown as Components,
                  allowElement,
                }}
                commands={toolbarCommands}
                components={{
                  toolbar: (command, disabled, executeCommand) => {
                    try {
                      if (command?.keyCommand === 'divider') return undefined
                      const btnProps = (command?.buttonProps || {}) as React.ButtonHTMLAttributes<HTMLButtonElement>
                      const raw = (btnProps.title || btnProps['aria-label'] || command?.name || '') as string
                      const l = String(raw).toLowerCase()
                      const label = (
                        l.includes('bold') ? t('mdBold') :
                        l.includes('italic') ? t('mdItalic') :
                        l.includes('strike') ? t('mdStrikethrough') :
                        l === 'title' || l.includes('heading') ? t('mdHeading') :
                        l.includes('quote') ? t('mdQuote') :
                        l.includes('code') ? t('mdCode') :
                        l.includes('link') ? t('mdLink') :
                        l.includes('image') ? t('mdImage') :
                        l.includes('unordered') || l.includes('bullet') ? t('mdUnorderedList') :
                        l.includes('ordered') || l.includes('numbered') ? t('mdOrderedList') :
                        l.includes('checked') || l.includes('task') ? t('mdCheckedList') :
                        l.includes('divider') || l === 'hr' ? t('mdDivider') :
                        l.includes('preview') ? t('mdPreview') :
                        l.includes('fullscreen') ? t('mdFullscreen') :
                        l.includes('color') ? t('mdColor') : raw
                      )
                      return (
                        <Tooltip title={label} placement="bottom" disableInteractive>
                          <button
                            type="button"
                            aria-label={label || undefined}
                            disabled={Boolean(disabled)}
                            onClick={(evn) => {
                              evn.stopPropagation()
                              const cmd = command as ICommand
                              executeCommand?.(cmd, cmd.groupName)
                            }}
                          >
                            {command?.icon}
                          </button>
                        </Tooltip>
                      )
                    } catch {
                      return undefined
                    }
                  },
                }}
                height={560}
              />
            </NoteRenderContext.Provider>
          ))()}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={handleInsertConfigChips}>{t('noteInsertConfigs')}</Button>
          <Button onClick={handleInsertMetasetsList}>{t('noteInsertMetasets')}</Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => setConfirmOpen(true)}
          >
            {t('reset')}
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={commitAndClose}>{t('close')}</Button>
        </Box>
      </DialogActions>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{t('titleClearNote')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgClearNote')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { setConfirmOpen(false); setDraft(''); onChange('') }}>{t('reset')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
