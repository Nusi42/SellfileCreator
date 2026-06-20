/**
 * overridesDiagnostics.ts
 *
 * Thin linting layer for recipe-overrides / safeguard-overrides DSL blocks.
 * Structural errors (@ after a logic connector, @ inside an assignment block,
 * unknown terms after a connector) are detected by the real parser in
 * noteRecipeOverrides.ts — `collectRecipeOverridesDiagnostics` runs the full
 * parse with a diagnostics collector threaded in via closure.
 *
 * This module handles only the one class of error that requires raw source text
 * rather than a token stream: prematurely- or un-closed string literals, which
 * the tokenizer silently swallows rather than producing a parse error.
 */

import {
  tokenize,
  type DiagnosticSpan,
  NOTE_OVERRIDES_QUESTION_KEYWORDS,
  NOTE_OVERRIDES_FALLBACK_KEYWORDS,
  NOTE_OVERRIDES_GROUP_TYPE_MAP,
} from './noteOverridesParser'
import { NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD } from './noteSafeguardOverrides'
import { collectRecipeOverridesDiagnostics } from './noteRecipeOverrides'
import { collectSafeguardOverridesDiagnostics } from './noteSafeguardOverrides'

export type { DiagnosticSpan }

// Matches a newline followed by optional whitespace and a DSL structural keyword
// at the start of a line.  When found inside a string token's VALUE, the string
// was almost certainly closed prematurely by a " that belongs to a group-option
// label on a later line.
const STRUCTURAL_KW_AT_LINE_START_RE = new RegExp(
  `\\n\\s*(?:${[
    ...Object.keys(NOTE_OVERRIDES_GROUP_TYPE_MAP),
    ...NOTE_OVERRIDES_QUESTION_KEYWORDS,
    ...NOTE_OVERRIDES_FALLBACK_KEYWORDS,
  ].join('|')})\\b`,
)

// Matches recipe-overrides, safeguard-overrides, and config-options blocks.
// Exported as the single source for "what counts as a dynamic-overrides DSL block"
// so callers that strip them (e.g. preset-equivalence checks) stay in lock-step.
export const DSL_BLOCK_RE_SOURCE =
  `<!--\\s*(?:recipe-overrides|${NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD}|config-options)\\b[\\s\\S]*?-->`

/**
 * Scans `text` for all DSL comment blocks and returns diagnostic spans for
 * token-level structural errors found within them.
 */
export function collectOverridesDiagnostics(text: string): DiagnosticSpan[] {
  const diags: DiagnosticSpan[] = []
  for (const match of text.matchAll(new RegExp(DSL_BLOCK_RE_SOURCE, 'g'))) {
    const block = match[0]
    const blockOffset = match.index ?? 0
    // String-literal diagnostics (tokenizer-level; cannot be detected by the parser).
    collectStringDiagnostics(block, blockOffset, diags)
    // Structural diagnostics: @ placement, unknown terms (detected by the real parser).
    // Each function silently no-ops when the block's marker keyword doesn't match.
    collectRecipeOverridesDiagnostics(block, blockOffset, diags)
    collectSafeguardOverridesDiagnostics(block, blockOffset, diags)
  }
  return diags
}

// ── String-literal detection ────────────────────────────────────────────────
// The tokenizer resolves an unterminated or prematurely-closed string by
// snapping to the next " in the input (or end-of-input).  Both cases are
// invisible to the parser but can be detected here from the raw source.

/**
 * Returns the index of the closing `"` for the string opening at `start`,
 * or null if the string runs to end-of-input (truly unterminated).
 * Mirrors the tokenizer's escape handling.
 */
function findStringClose(text: string, start: number): number | null {
  let i = start + 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') return i
    if (ch === '\\') { i += 2; continue }
    i++
  }
  return null
}

function collectStringDiagnostics(
  block: string,
  blockOffset: number,
  diags: DiagnosticSpan[],
): void {
  const tokens = tokenize(block)
  for (const token of tokens) {
    if (token.kind !== 'string') continue
    const closeIdx = findStringClose(block, token.index)
    const lineEnd = block.indexOf('\n', token.index)
    const spanTo = blockOffset + (lineEnd >= 0 ? lineEnd : block.length)

    if (closeIdx === null) {
      // Truly unterminated — no closing " at all.
      diags.push({
        from: blockOffset + token.index,
        to: spanTo,
        message: 'Unterminated string — missing closing "',
      })
      continue
    }

    // Signal A: closing " is the opening " of a backtick-labeled group option
    // (e.g. `"`Very relaxed`"`).  The string on the opening line was not closed.
    const closedByLabel = token.value.includes('\n') && block[closeIdx + 1] === '`'
    // Signal B: the string value contains a DSL structural keyword at line start,
    // meaning the string consumed content that belongs to the next option line.
    const containsStructuralKw = STRUCTURAL_KW_AT_LINE_START_RE.test(token.value)

    if (closedByLabel || containsStructuralKw) {
      diags.push({
        from: blockOffset + token.index,
        to: spanTo,
        message: 'Unclosed string — the closing " on this line is missing; the parser snapped shut at a later "',
      })
    }
  }
}
