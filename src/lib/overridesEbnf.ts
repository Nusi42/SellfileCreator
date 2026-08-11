/**
 * overridesEbnf.ts
 *
 * Builders for the recipe-overrides / safeguard-overrides EBNF reference shown in
 * the note editor's syntax popover. Extracted from NoteDialog so the text is
 * unit-testable and — crucially — SSOT-derived: every enumerable token list
 * (assignment fields, enum values, group/constraint/logic keywords, slot and
 * rarity names, marker keywords) is interpolated from the SAME parser constants
 * the grammar, highlighter, and editor use. Only the per-field value *shapes*
 * (which are documentation prose) are literal text, and those are pinned by
 * tests/unit/overrides-ssot-completeness.test.ts, which asserts every SSOT token
 * appears in the built text.
 *
 * Historical motivation: the previous hand-written text had already drifted
 * (`action` was missing from the recipe field list, and `autolate`'s values were
 * undocumented). Derivation + the coverage test make that class of drift either
 * impossible or CI-fatal.
 */
import {
  NOTE_OVERRIDES_BOOLEAN_KEYWORDS,
  NOTE_OVERRIDES_CONSTRAINT_KEYWORDS,
  NOTE_OVERRIDES_CROSS_KEYWORDS,
  NOTE_OVERRIDES_FALLBACK_KEYWORDS,
  NOTE_OVERRIDES_GROUP_TYPE_MAP,
  NOTE_OVERRIDES_LOGIC_KEYWORDS,
  NOTE_OVERRIDES_MARKER_COLUMNS_KEY,
  NOTE_OVERRIDES_MARKER_OPTION_COLUMNS_KEY,
  NOTE_OVERRIDES_QUESTION_KEYWORDS,
  NOTE_OVERRIDES_SETVAL_KEYWORD,
  NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS,
  SLIDER_PARAM_KEYWORDS,
  SLIDER_TOGGLE_DEFAULT_VALUES,
  SLIDER_TOGGLE_SIDE_VALUES,
  type NoteQuestionGroupType,
} from './noteOverridesParser'
import {
  NOTE_RECIPE_OVERRIDES_ACTION_VALS,
  NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS,
  NOTE_RECIPE_OVERRIDES_EXPORT_VALS,
  NOTE_RECIPE_OVERRIDES_KEEP_VALS,
  NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD,
  NOTE_RECIPE_OVERRIDES_RARITY_NAMES,
  NOTE_RECIPE_OVERRIDES_SLOT_NAMES,
} from './noteRecipeOverrides'
import {
  NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS,
  NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_SAFEGUARD_OVERRIDES_IMPROVEMENT_CHANCE_KW_VALS,
  NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD,
  NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS,
} from './noteSafeguardOverrides'
import { dslSubstatKeys } from './types'

// Wrap limit matched to the EBNF popover width (~126 chars at its mono font size).
const EBNF_MAX_LINE_LENGTH = 126

// Quote one terminal token for EBNF output.
const quoteTok = (word: string): string => `"${word.replace(/"/g, '\\"')}"`

// Render a keyword list as an EBNF alternation: `"a" | "b" | "c"`.
const alt = (words: readonly string[]): string => words.map(quoteTok).join(' | ')

/**
 * Render a whole `name := a | b | …` rule with the popover's hanging-indent wrapping:
 * alternates flow up to EBNF_MAX_LINE_LENGTH, then continue on aligned `| ` lines.
 * Used for every derived alternation long enough to overflow (fields, stat keys) so
 * SSOT interpolation keeps the reference's original two-line readability.
 */
const wrapAltRule = (name: string, alternates: readonly string[]): string => {
  // 14-char name column + ':= ' matches the hand-formatted rules around it.
  const prefix = `${name.padEnd(14)}:= `
  const continuation = '             | '
  const lines: string[] = []
  let current = prefix
  for (const alternate of alternates) {
    if (current === prefix) {
      current = `${current}${alternate}`
      continue
    }
    // Wrap onto a continuation line once the popover width would overflow.
    const candidate = `${current} | ${alternate}`
    if (candidate.length > EBNF_MAX_LINE_LENGTH) {
      lines.push(current)
      current = `${continuation}${alternate}`
    } else {
      current = candidate
    }
  }
  if (current.trim()) lines.push(current)
  return lines.join('\n')
}

// Group-type surface keywords for one logical type, from the shared keyword map.
const groupKeywords = (type: NoteQuestionGroupType): string[] => (
  Object.entries(NOTE_OVERRIDES_GROUP_TYPE_MAP)
    .filter(([, logical]) => logical === type)
    .map(([keyword]) => keyword)
)

// Choice-group keywords (radio + checkbox families) and slider keywords.
const CHOICE_GROUP_KEYWORDS = [...groupKeywords('single'), ...groupKeywords('multi')]
const SLIDER_GROUP_KEYWORDS = groupKeywords('slider')

// Word-form constraint keywords that take a bare token list (needs/setval have
// their own argument shapes and get dedicated lines).
const SIMPLE_CONSTRAINT_KEYWORDS = NOTE_OVERRIDES_CONSTRAINT_KEYWORDS
  .filter((keyword) => keyword !== 'needs' && keyword !== NOTE_OVERRIDES_SETVAL_KEYWORD)

// Bare tag-selector heads (`all` / `tagged` / `untagged`); `tag` appears in `term`.
const TAG_SELECTOR_BARE_KEYWORDS = NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS.filter((keyword) => keyword !== 'tag')

// Numeric slider params (the rest have per-param value shapes below).
const SLIDER_NUMERIC_PARAMS = SLIDER_PARAM_KEYWORDS
  .filter((keyword) => keyword === 'min' || keyword === 'max' || keyword === 'step' || keyword === 'default')

// ── Shared line fragments (identical in both grammars) ────────────────────────

const MARKER_OPTIONS_LINES = `markerOptions := "[" markerOption ("," markerOption)* "]"
markerOption  := (${quoteTok(NOTE_OVERRIDES_MARKER_COLUMNS_KEY)} | ${quoteTok(NOTE_OVERRIDES_MARKER_OPTION_COLUMNS_KEY)}) "=" number`

const QUESTION_LINE = `question      := (${alt(NOTE_OVERRIDES_QUESTION_KEYWORDS)}) string ["id" "=" token] group+ [fallbackBlock]
             // id=token PINS the question's identity: saved answers survive later prompt/option
             // edits (without it, the id is re-hashed from prompt+options and old answers orphan)`

const EXPR_LINES = `expr          := notExpr ((${alt(NOTE_OVERRIDES_LOGIC_KEYWORDS)} | "&&" | "||") notExpr)*
notExpr       := ("not" | "!") notExpr | "(" expr ")" | term`

const ELSE_FALLBACK_LINES = `elseBlock     := (${alt(NOTE_OVERRIDES_FALLBACK_KEYWORDS)}) "{" (selectorBlock | crossBlock)+ "}"   // option-level: applied when THIS option is unselected (e.g. unchecked box)
fallbackBlock := (${alt(NOTE_OVERRIDES_FALLBACK_KEYWORDS)}) "{" (selectorBlock | crossBlock)+ "}"   // marker-level: applied when NO option in the marker is selected`

const CONSTRAINTS_LINES = `constraints   := ("!" | "+" | "-" | "^" | ${alt(SIMPLE_CONSTRAINT_KEYWORDS)}) tokenList
             | "needs" ["=" (${alt(['on', 'off'])})] tokenList   // disabled in the UI until a referenced id is selected; =on/off sets the shown state while disabled
             | ${quoteTok(NOTE_OVERRIDES_SETVAL_KEYWORD)} valueAssignList
tokenList     := token ("," token)*
valueAssignList := token "=" number ("," token "=" number)*
                 // ${NOTE_OVERRIDES_SETVAL_KEYWORD}: when THIS option becomes selected, write number into the slider whose
                 // id=token marker matches (persisted like a drag; the slider may live in the other domain)`

// NOTE: quote/backslash terminals are written in their ESCAPED form ("\"" / "\\") —
// the ebnf Prism string pattern understands backslash escapes, so a bare "\" or a
// single-quoted '"' would open a runaway string token and break the coloring.
const STRING_TOKEN_LINES = `string        := "\\"" {char | escape} "\\""
escape        := "\\\\" ("n" | "t" | "r" | "\\\\" | "\\"")  (\\n = newline, \\\\ = literal backslash)
comment       := "//" {any} eol | "/*" {any} "*/"
token         := /[\\p{L}\\p{M}_][\\p{L}\\p{N}\\p{M}_]*/  (unicode letters/marks, underscore)`

const SHARED_VALUE_LINES = `flexVal       := ${alt(NOTE_OVERRIDES_BOOLEAN_KEYWORDS)}
rankVal       := "any" | rankNum
rankNum       := "1" | "2" | "3" | "4" | "5" | "6"
lvlVal        := lvlMilestone | lvlMilestone "-" lvlMilestone
lvlMilestone  := "0" | "4" | "8" | "12" | "16"
starKey       := "1" | "2" | "3" | "4" | "5" | "6" | "one" | "two" | "three" | "four" | "five" | "six"
targetNum     := number, decimals allowed (e.g. 1.25)
                 // stat TARGET values only (rolltarget., minima.STAR.STAT); every other
                 // number is a count and truncates. Values snap to the stat's value grid.
prefixToken   := ["+" | "-"] token   (all prefixed XOR all bare; mixed is ignored)
gearToken     := ["+" | "+-" | "-"] token`

// Recipe assignment/value documentation shared verbatim by the recipe grammar and
// the safeguard grammar's cross-domain (`recipe @…`) section.
const RECIPE_ASSIGNMENT_LINES = `recipeAssign  := ("rank" | "rarity") ("=" | ">=" | "<=") value
             | ("slots" | "substats" | "mainstats" | "metasets") "=" prefixToken ("," prefixToken)*
             | "gearsets" "=" gearToken ("," gearToken)* | field "=" value
             | "rolltarget." statKey "=" targetNum ("," [targetNum])*
${wrapAltRule('field', [
  ...NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS.map(quoteTok),
  '"substatmin." statKey', '"minima.any"', '"minima." starKey "." statKey',
])}
value         := exportVal | keepVal | actionVal | autolateVal | flexVal | rankVal | lvlVal | rarityName | number | string
exportVal     := ${alt(NOTE_RECIPE_OVERRIDES_EXPORT_VALS)}
keepVal       := ${alt(NOTE_RECIPE_OVERRIDES_KEEP_VALS)}
actionVal     := ${alt(NOTE_RECIPE_OVERRIDES_ACTION_VALS)}
autolateVal   := ${alt(NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS)}
rarityName    := ${alt(NOTE_RECIPE_OVERRIDES_RARITY_NAMES)}
slotName      := ${alt(NOTE_RECIPE_OVERRIDES_SLOT_NAMES)}
setName       := ["+" | "+-" | "-"] /set name, case-insensitive; quote multi-word: "Crit Damage"/
metasetName   := ["+" | "-"] /metaset name, case-sensitive; must be unique in the save file/`

// ── Recipe-overrides EBNF ─────────────────────────────────────────────────────

const RECIPE_OVERRIDES_EBNF_BASE = `marker        := "<!--" ${quoteTok(NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD)} [markerOptions] [question group+ [fallbackBlock]] "-->"
${MARKER_OPTIONS_LINES}
${QUESTION_LINE}
group         := (${alt(CHOICE_GROUP_KEYWORDS)})
             string [string] [headerToken {headerToken}] [constraints] "{" (selectorBlock | crossBlock)* [elseBlock] "}"
headerToken   := "id" "=" token | "*" | "default"
selectorBlock := "@" selector "{" recipeAssign+ "}"
crossBlock    := ${quoteTok(NOTE_OVERRIDES_CROSS_KEYWORDS.recipe)} "@" selector "{" sgAssignment+ "}"  // targets safeguard rules from a recipe-overrides marker
selector      := ${alt(TAG_SELECTOR_BARE_KEYWORDS)} | expr
${EXPR_LINES}
term          := "tag" ("=" | ":") token | "tag" ("in" "[" tokenList "]" | "any" | "none")
             | "rank" "=" rankVal | "rank" (">=" | "<=") rankNum | "rarity" ("=" | ">=" | "<=") rarityName
             | "minrolls" ("=" | ">=" | "<=") number | "lockedminrolls" ("=" | ">=" | "<=") number
             | "minsubstats" ("=" | ">=" | "<=") number | "flex" ("=" | ":") flexVal
             | "substatmin" ("=" | ">=" | "<=") number | "substatmin." statKey ("=" | ">=" | "<=") number
             | "minima.any" ("=" | ">=" | "<=") number | "minima." starKey "." statKey ("=" | ">=" | "<=") number
${RECIPE_ASSIGNMENT_LINES}
${ELSE_FALLBACK_LINES}
${CONSTRAINTS_LINES}
${STRING_TOKEN_LINES}
${SHARED_VALUE_LINES}`

// ── Safeguard-overrides EBNF ──────────────────────────────────────────────────

const SAFEGUARD_OVERRIDES_EBNF_BASE = `marker        := "<!--" ${quoteTok(NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD)} [markerOptions] [question group+ [fallbackBlock]] "-->"
${MARKER_OPTIONS_LINES}
${QUESTION_LINE}
group         := (${alt(CHOICE_GROUP_KEYWORDS)})
             string [string] [headerToken {headerToken}] [constraints] "{" (selectorBlock | crossBlock)* [elseBlock] "}"
             | (${alt(SLIDER_GROUP_KEYWORDS)}) string [headerToken {headerToken}] [constraints]
               sliderParam {sliderParam} "{" (selectorBlock | crossBlock)+ [elseBlock] "}"
sliderParam   := (${alt(SLIDER_NUMERIC_PARAMS)}) "=" number
             | "marks" "=" markItem ("," markItem)*        // labeled guide ticks
             | "unit" "=" string                           // display-only suffix on the value (e.g. "%")
             | "toggle" "=" string                         // adds an on/off checkbox (off ⇒ the else block)
             | "toggleside" "=" (${alt(SLIDER_TOGGLE_SIDE_VALUES)})         // checkbox placement (default: above)
             | "toggledefault" "=" (${alt(SLIDER_TOGGLE_DEFAULT_VALUES)})           // initial checkbox state (default: on)
markItem      := number ":" string [":" string]            // value : label [: subtext-tooltip]
headerToken   := "id" "=" token | "*" | "default"
selectorBlock := "@" selector "{" sgAssignment+ "}"
crossBlock    := ${quoteTok(NOTE_OVERRIDES_CROSS_KEYWORDS.safeguard)} "@" selector "{" recipeAssign+ "}"  // targets recipes from a safeguard-overrides marker
${RECIPE_ASSIGNMENT_LINES}
selector      := ${alt(TAG_SELECTOR_BARE_KEYWORDS)} | expr
${EXPR_LINES}
term          := "tag" ("=" | ":") token | "tag" ("in" "[" tokenList "]" | "any" | "none")
${wrapAltRule('sgField', NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS.map(quoteTok))}
sgAssignment  := "activation" "=" activationVal
             | "count" "=" countExpr   // $count/$value expand to current slider position
             | ("ignprev"|"igncoll"|"ignvault"|"perfaction"|"permainstat"|"perslot"|"perset"|"perrule") "=" flexVal
             | "substats" "=" prefixToken ("," prefixToken)*
             | "substatmatch" "=" subMatchVal
             | "weight." statKey "=" number   // statKey case-insensitive (spd = SPD)
             | "improvchance" "=" impChanceVal
             | "rank" "=" prefixNum ("," prefixNum)*     // replace or mutate rank filter
             | "rarity" "=" prefixRarity ("," prefixRarity)*   // replace or mutate rarity filter
             | "faction" "=" prefixToken ("," prefixToken)*    // replace or mutate faction filter
             | "gearsets" "=" gearToken ("," gearToken)*       // +-Name adds an excluded set (as in recipes)
             | "metasets" "=" prefixToken ("," prefixToken)*   // replace or mutate metaset-name filter
countExpr     := "$count" | "$value" | "$count." token | number (("+" | "-" | "*" | "/") number)*
                 // in slider groups $count/$value expand to the current slider position
prefixNum     := ["+" | "-"] rankNum
prefixRarity  := ["+" | "-"] (rankNum | rarityName)
activationVal := ${alt(NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS)}
subMatchVal   := ${alt(NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS)}
impChanceVal  := "off" | ${alt(NOTE_SAFEGUARD_OVERRIDES_IMPROVEMENT_CHANCE_KW_VALS)} | "$value" | number ("," [number])*
                 // $value = the enclosing slider's position (flat threshold at every stage)
                 // 1–4 comma-separated values; omitted slots inherit from the previous stage
${ELSE_FALLBACK_LINES}
${CONSTRAINTS_LINES}
${STRING_TOKEN_LINES}
${SHARED_VALUE_LINES}`

// ── Runtime statKey row (labels come from the stat-variant SSOT) ──────────────

// Compose the wrapped `statKey := …` alternation row from the DSL vocabulary SSOT.
// Every `statKey` position in this grammar is a SUBSTAT position (substatmin.,
// minima.STAR., rolltarget., weight.), and the list is spelled through
// statVariantToKey — so the reference shows the tokens that are actually typable
// (PROVISIONAL(anomalous) stats appear as `pveDmgPlus`, not "PvE DMG +", whose
// `+` and spaces are token separators here).
const buildStatKeyLine = (): string => wrapAltRule('statKey', dslSubstatKeys().map(quoteTok))

/** Full recipe-overrides EBNF reference text (statKey row injected at call time). */
export function buildRecipeOverridesEbnfText(): string {
  return `${RECIPE_OVERRIDES_EBNF_BASE}\n${buildStatKeyLine()}`
}

/** Full safeguard-overrides EBNF reference text (same statKey row as recipes). */
export function buildSafeguardOverridesEbnfText(): string {
  return `${SAFEGUARD_OVERRIDES_EBNF_BASE}\n${buildStatKeyLine()}`
}
