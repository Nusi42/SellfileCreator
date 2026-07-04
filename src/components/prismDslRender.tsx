/**
 * prismDslRender — shared refractor(HAST) → React rendering for the note DSL
 * grammars. Single home for the token → colour mapping (extracted from NoteDialog
 * so the visual override editor can highlight raw-DSL fields with the SAME
 * palette as the note editor backdrop and tooltips).
 *
 * Inline colors reference the per-scheme `--note-tok-*` vars (with the raw hex as
 * fallback), so consumers inherit the contrast-adapted palette wherever the
 * NoteDialog GlobalStyles are mounted. See src/lib/noteColorVars.ts.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import { refractor } from 'refractor'
import type { RootContent } from 'hast'
// Grammar registration side effect: the renderer is unusable without it.
import '../lib/prismDynamicOverrides'
import { RECIPE_OVERRIDES_TOKEN_COLORS, noteTokVar } from '../lib/noteColorVars'

/** Recursively convert one refractor (HAST) node to React elements. */
export function renderPrismNode(node: RootContent, key: number): ReactNode {
  if (node.type === 'text') return node.value
  if (node.type === 'element') {
    const classes = (node.properties?.className as string[]) ?? []
    // Pick the first token class that has a mapped color; skip the generic 'token' wrapper.
    const tokenClass = classes.find((c) => c !== 'token' && Boolean(RECIPE_OVERRIDES_TOKEN_COLORS[c]))
    // Resolve via the per-scheme var so light mode stays legible; fall back to the
    // base hex when the GlobalStyles vars aren't mounted.
    const color = tokenClass
      ? `var(${noteTokVar(tokenClass)}, ${RECIPE_OVERRIDES_TOKEN_COLORS[tokenClass]})`
      : undefined
    return (
      <span key={key} style={color ? { color } : undefined}>
        {node.children.map((child, i) => renderPrismNode(child as RootContent, i))}
      </span>
    )
  }
  return null
}

/** Highlight `text` as bare React children (no wrapper element) — for callers that
 *  provide their own container, e.g. the editable-field highlight overlay. Falls
 *  back to the plain text when the grammar is unregistered. */
export function renderPrismChildren(text: string, grammar: string): ReactNode {
  try {
    const tree = refractor.highlight(text, grammar)
    return tree.children.map((child, i) => renderPrismNode(child as RootContent, i))
  } catch {
    return text
  }
}

/** Highlight `text` with the given refractor grammar into a styled <pre>.
 *  Falls back to plain text if the grammar is not registered. */
export function renderPrismHighlighted(text: string, grammar: string, sx: Record<string, unknown>): ReactNode {
  return <Box component="pre" sx={sx}>{renderPrismChildren(text, grammar)}</Box>
}

/** Like renderPrismHighlighted but uses <code> so the element is inline-block-capable,
 *  suitable for grid cells where a block <pre> would break row alignment. */
export function renderPrismHighlightedCode(text: string, grammar: string, sx: Record<string, unknown>): ReactNode {
  return <Box component="code" sx={sx}>{renderPrismChildren(text, grammar)}</Box>
}
