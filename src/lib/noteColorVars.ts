// ─── Note syntax & custom-colour SSOT, contrast-adapted per scheme ───────────
// Single home for the two colour maps the Note dialog paints on top of the
// editor/preview surface, plus the machinery that makes them legible in BOTH
// schemes. Both maps were hand-tuned for a dark backdrop; on the light surface
// many hues drop below WCAG legibility. Rather than fork a second palette we run
// each colour through `ensureContrastOnBg` against the *runtime* per-scheme
// `background.default` (the surface every note region sits on — live editor
// backdrop, view-mode markdown, and the recipe/safeguard tooltip <pre> blocks)
// and publish the results as CSS custom properties via GlobalStyles. The CSS
// backdrop (styles.css) and the inline tooltip renderer reference the same vars,
// so there is exactly one definition per colour and they can never drift.
import type { Theme } from '@mui/material/styles'
import { ensureContrastOnBg } from './colorUtils'
import { resolveSchemePalette, type SchemeMode } from './themeCustomTokens'

// Limited colour palette for Note highlighting rendered from Markdown via
//   <span data-color="{name}">…</span>
// Kept intentionally small and named. The NoteDialog sanitizer permits only the
// data-color attribute on span. These are user-applied colours shown as TEXT, so
// they are contrast-adapted at render time (see buildNoteColorSchemeStyles); the
// raw values below double as the var fallback and as the picker swatch identity.
export const NOTE_COLOR_HEX: Record<'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'gray', string> = {
  red: '#ef5350',
  orange: '#ffa726',
  yellow: '#ffeb3b',
  green: '#66bb6a',
  teal: '#26a69a',
  blue: '#42a5f5',
  purple: '#ab47bc',
  gray: '#90a4ae',
}

// Maps each dynamic-overrides Prism token class to its base display colour.
// Mirrors styles.css so the same palette is applied both in the editor backdrop
// and in tooltip <pre> blocks (where the .w-md-editor-text-pre scope doesn't
// apply). Both consumers now reference the per-scheme vars derived from this map,
// so this object is the single source of truth for every token hue.
export const RECIPE_OVERRIDES_TOKEN_COLORS: Record<string, string> = {
  'comment-delimiter': '#5c8baf',
  'directive-kw':      '#c678dd',
  'line-comment':      '#5c6370',
  'block-comment':     '#5c6370',
  'regex':             '#5c6370',  // /…/ informal description in EBNF
  // id=TOKEN split: `id` keyword (blue keyword family) + defined name (bright amber)
  'id-kw':             '#7ab3d4',
  'id-name':           '#f0a757',
  'string':            '#98c379',
  'string-bold':       '#c3e88d',
  'string-chip':       '#7ec8e3',
  // marker-option outer span intentionally has no color; inner tokens are colored individually.
  'marker-option-kw':  '#56b6c2',  // columns – teal, same family as field names
  'default-kw':        '#e06c75',  // same as selector-at (@) – both are sigil-level markers
  'question-kw':       '#7ab3d4',
  'group-type':        '#4a8aad',
  'fallback-kw':       '#e06c75',
  'selector-builtin':  '#61afef',
  'selector-field':    '#61afef',
  'field':             '#56b6c2',
  'id-assign':         '#f0a757',
  'constraint-kw':     '#e5c07b',  // word-form: set / unset / only / excl
  'constraint-op':     '#e87c3e',  // symbolic-form: ! + - ^ (operator sigil, distinct from keyword)
  'id-ref':            '#c8a96e',
  'logic-kw':          '#61afef',
  'rarity-name':       '#e5c07b',
  'boolean-val':       '#d19a66',
  'slot-name':         '#d19a66',  // same warm amber as boolean-val (enumerable value)
  'stat-key':          '#56b6c2',
  'number':            '#d19a66',
  'selector-at':       '#e06c75',
  'operator':          '#abb2bf',
  'punctuation':       '#abb2bf',
  // note-markers sub-tokens
  'marker-kw':         '#c678dd',
  'slider-param-kw':   '#56b6c2',  // min / max / step — same family as field names
  // safeguard-overrides specific tokens — reuse existing palette hues for consistency.
  'sg-activation-val':          '#d19a66',  // same as boolean-val (warm amber)
  'sg-match-val':               '#d19a66',  // same as boolean-val (warm amber)
  'sg-improvementchance-val':   '#d19a66',  // same as boolean-val (warm amber)
  // $value / $count / $count.TOKEN — bright green to distinguish slider refs from
  // plain numbers (matches the live editor backdrop; reconciled from a prior drift
  // where the tooltip path rendered this red).
  'sg-value-ref':               '#98c379',
  // cross-domain block prefix (`safeguard @…` / `recipe @…`) — purple, distinct from field names
  'cross-domain-kw':   '#c678dd',
  // ebnf grammar tokens — used only in EBNF tooltip blocks, not in DSL editor.
  'paren-comment':     '#5c6370',  // same muted gray as line-comment — informal annotations
  'regex-literal':     '#c8a96e',  // muted amber, distinct from line-comment gray
}

// CSS-var name builders — the single bridge between this module and styles.css.
// styles.css references these exact names; the generator below defines them. A
// token/colour with no published var falls back to its raw hex at the use site.
export const noteTokVar = (tokenClass: string): string => `--note-tok-${tokenClass}`
export const noteColorVar = (name: string): string => `--note-color-${name}`

// SX selector map for the view-mode markdown Box: colour each `<span data-color>`
// via its per-scheme var, falling back to the raw hex if the vars aren't mounted.
export const NOTE_COLOR_SX_SELECTORS: Record<string, { color: string }> = Object.fromEntries(
  (Object.entries(NOTE_COLOR_HEX) as Array<[keyof typeof NOTE_COLOR_HEX, string]>).map(([name, hex]) => [
    `& [data-color="${name}"]`,
    { color: `var(${noteColorVar(name)}, ${hex})` },
  ]),
)

// Build the contrast-adapted vars for one scheme against its real background.default.
// ensureContrastOnBg self-gates: colours already ≥3:1 pass through untouched, so the
// dark scheme stays visually identical while light hues are darkened just enough.
function buildSchemeVars(theme: Theme, mode: SchemeMode): Record<string, string> {
  const surface = resolveSchemePalette(theme, mode).background.default
  const vars: Record<string, string> = {}
  // Syntax-highlight token hues.
  for (const [tokenClass, hex] of Object.entries(RECIPE_OVERRIDES_TOKEN_COLORS)) {
    vars[noteTokVar(tokenClass)] = ensureContrastOnBg(hex, surface)
  }
  // User-applied note colours.
  for (const [name, hex] of Object.entries(NOTE_COLOR_HEX)) {
    vars[noteColorVar(name)] = ensureContrastOnBg(hex, surface)
  }
  return vars
}

// GlobalStyles payload publishing both colour maps as per-scheme CSS vars. Keyed
// on the MUI scheme attribute so the cascade resolves the right value inside the
// dialog. Recompute (useMemo on `theme`) so custom themes that change
// background.default re-adapt automatically.
export function buildNoteColorSchemeStyles(theme: Theme): Record<string, Record<string, string>> {
  return {
    '[data-mui-color-scheme="dark"]': buildSchemeVars(theme, 'dark'),
    '[data-mui-color-scheme="light"]': buildSchemeVars(theme, 'light'),
  }
}
