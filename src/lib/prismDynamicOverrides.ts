/**
 * Registers a `dynamic-overrides` Prism grammar with the shared refractor instance
 * so that `<!-- recipe-overrides ... -->`, `<!-- safeguard-overrides ... -->`, and
 * `<!-- config-options ... -->` comment blocks in the note editor are syntax-highlighted.
 *
 * Also registers a `note-markers` grammar for the simpler inline markers:
 *   <!-- recipes: 1,0,2 -->
 *   <!-- recipes-re: "pattern" -->
 *   <!-- safeguards: 1,2 -->
 *   <!-- safeguards-re: "ring" -->
 *
 * Import this module for its side effect only:
 *   import '../lib/prismDynamicOverrides';
 *
 * This module is intentionally side-effect-only (no exports).
 */

import { refractor } from 'refractor';
import type { Refractor, Syntax } from 'refractor/core';
import markdownLang from 'refractor/markdown';
// markdown.js auto-registers markup (HTML) as a dependency — both grammars are available
// after this call. Explicit registration is required because the Vite alias maps
// 'refractor' → 'refractor/core', which ships no languages pre-loaded.
refractor.register(markdownLang);
import {
  NOTE_RECIPE_OVERRIDES_QUESTION_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_FALLBACK_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_GROUP_TYPE_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_RARITY_NAMES,
  NOTE_RECIPE_OVERRIDES_ENUM_VALS,
  NOTE_RECIPE_OVERRIDES_SLOT_NAMES,
  NOTE_RECIPE_OVERRIDES_SELECTOR_BUILTINS,
  NOTE_RECIPE_OVERRIDES_CONSTRAINT_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_LOGIC_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS,
  NOTE_RECIPE_OVERRIDES_MARKER_COLUMNS_KEY,
  NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD_PATTERN,
} from './noteRecipeOverrides';
import {
  NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD,
  NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS,
  NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS,
  NOTE_SAFEGUARD_OVERRIDES_IMPROVEMENT_CHANCE_KW_VALS,
} from './noteSafeguardOverrides';
import {
  SLIDER_PARAM_KEYWORDS,
  SLIDER_TOGGLE_SIDE_VALUES,
  NOTE_OVERRIDES_SETVAL_KEYWORD,
  NOTE_OVERRIDES_CROSS_KEYWORDS,
} from './noteOverridesParser';

// All marker-opening keywords (recipe + legacy alias + safeguard), derived from the
// marker SSOT constants so this grammar can never highlight a keyword set that
// drifts from what the parsers accept.
const ALL_MARKER_KEYWORDS_PATTERN =
  `${NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD_PATTERN}|${NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD}`

// Build a \b-bounded alternation regex from a keyword array.
// Single source of truth: Prism patterns are derived from parser constants, not
// maintained as parallel hardcoded strings.
const wordAlt = (words: readonly string[]): RegExp => (
  new RegExp(`\\b(?:${words.join('|')})\\b`)
)

// Like wordAlt, but emits the alternation longest-first so prefix keywords
// (e.g. `toggle`) never shadow their longer forms (`toggleside`, `toggledefault`).
const wordAltLongestFirst = (words: readonly string[]): RegExp => (
  wordAlt([...words].sort((a, b) => b.length - a.length))
)

// ── marker-option patterns ──────────────────────────────────────────────────
// The only supported marker option is `columns=N`; the pattern is built from
// the shared constant so the key name stays a single source of truth.
const _markerColKey = NOTE_RECIPE_OVERRIDES_MARKER_COLUMNS_KEY
// Matches `[columns=N]`.
const MARKER_OPTION_PATTERN = new RegExp(
  `\\[\\s*${_markerColKey}=\\d+\\s*\\]`
)
// Inner keyword pattern for the marker-option-kw sub-token.
const MARKER_OPTION_KW_PATTERN = new RegExp(`\\b${_markerColKey}\\b`)

// ── dynamic-overrides grammar ───────────────────────────────────────────────
// Tokens are ordered from most-specific to least-specific so that Prism's
// greedy/first-match logic picks the right class when tokens overlap.

/** The grammar function typed as a refractor Syntax object. */
function recipeOverrides(Prism: Refractor): void {
    Prism.languages['dynamic-overrides'] = {

        // Opening/closing comment delimiters.  The `<!--` / `-->` scaffolding
        // is colored as a structural bracket; the directive keyword inside
        // (recipe-overrides / safeguard-overrides / config-options) gets the same hue as
        // note-markers keywords so every block-trigger reads as one family.
        'comment-delimiter': {
            pattern: new RegExp(
                `^<!--\\s*(?:${ALL_MARKER_KEYWORDS_PATTERN})\\b|-->$`
            ),
            inside: {
                'directive-kw': new RegExp(`(?:${ALL_MARKER_KEYWORDS_PATTERN})`),
            },
        },

        // Regex-literal notation used in the EBNF tooltip to express informal descriptions
        // without triggering keyword highlighting.  Consumed greedily so keywords inside
        // the slashes are not matched by any downstream token.
        // The negative lookbehind (?<!\w) prevents arithmetic division expressions like
        // `$value/8` from being swallowed as a regex-literal starting delimiter.
        'regex': {
            pattern: /(?<!\w)\/[^/\n]+\//,
            greedy: true,
        },

        // Quoted string literals (e.g. display labels for questions).
        // Marked greedy so that `// …` or `/* … */` sequences inside a string are not
        // claimed by the comment tokens below before the string itself is matched.
        // `inside` handles inline markup: **bold** emphasis and `chip` references.
        'string': {
            pattern: /"(?:\\[\s\S]|[^"\\])*"/,
            greedy: true,
            inside: {
                // Locale-segment markers (`[[de]]`, `[[pt-BR]]`) — translations travel inline
                // in the string; highlight the tag so authors can spot language boundaries.
                'string-locale': /\[\[[a-z]{2,3}(?:-[a-z0-9]{2,8})?\]\]/i,
                // Bold/emphasis spans (**text**) – rendered with label style.
                'string-bold': /\*\*(?:[^*]|\*(?!\*))*\*\*/,
                // Chip/option-label references in backticks, including `\N` numeric refs.
                'string-chip': /`(?:\\[\s\S]|[^`\\])*`/,
            },
        },

        // Single-line comments (`// …`).  After `string` (greedy) so quotes inside
        // strings are already claimed and never start a spurious comment match.
        'line-comment': /\/\/.*$/m,

        // Block comments (`/* … */`).  Same reasoning as `line-comment` above.
        'block-comment': /\/\*[\s\S]*?\*\//,

        // Inline marker-option block: `[columns=N]`.
        // Pattern is built from the shared constant (SSOT).
        // Uses `inside` so each piece gets its own color:
        //   marker-option-kw  – the `columns` keyword
        //   operator          – the `=` separator
        //   number            – the numeric card-width multiplier
        //   punctuation       – surrounding brackets
        'marker-option': {
            pattern: MARKER_OPTION_PATTERN,
            inside: {
                // Option keyword names – teal, same family as field names.
                'marker-option-kw': MARKER_OPTION_KW_PATTERN,
                // `=` separator between key and value.
                'operator': /=/,
                // Numeric column-count value.
                'number': /\d+/,
                // Surrounding brackets and comma separators.
                'punctuation': /[[\],]/,
            },
        },

        // `*` shorthand or `default` keyword that marks the default answer option.
        // Rendered bright so the default choice is immediately visible.
        // `*` is matched only when preceded by whitespace (lookbehind) so that EBNF
        // repetition suffixes like `)*` are not misclassified as default markers.
        // Must precede `punctuation` so `*` is claimed here rather than going gray.
        'default-kw': /\bdefault\b|(?<=\s)\*/,

        // Keywords that open a question block – derived from parser constant (SSOT).
        'question-kw': wordAlt(NOTE_RECIPE_OVERRIDES_QUESTION_KEYWORDS),

        // Group-type tokens – derived from parser constant (SSOT).
        'group-type': wordAlt(NOTE_RECIPE_OVERRIDES_GROUP_TYPE_KEYWORDS),

        // Keywords that open a fallback / default-answer block (SSOT).
        'fallback-kw': wordAlt(NOTE_RECIPE_OVERRIDES_FALLBACK_KEYWORDS),

        // Built-in selector and tag-match keywords (SSOT).
        // `any` / `none` appear in `tag any` / `tag none` / `rank=any`.
        'selector-builtin': wordAlt(NOTE_RECIPE_OVERRIDES_SELECTOR_BUILTINS),

        // `tag=TOKEN` or `tag:TOKEN` – captures the full tag-equality expression.
        // Accepts both `=` and `:` as the parser does (bug #8 fix).
        // Must precede `selector-field` so `tag=value` is consumed before bare `tag`.
        'tag-comparison': {
            pattern: /\btag\s*[=:]\s*\w[\w-]*/,
            inside: {
                // The `tag` keyword remains in the blue selector-field family.
                'selector-field': /\btag\b/,
                // The `=` or `:` separator is a plain operator.
                'operator': /[=:]/,
                // The user-supplied tag name is a referenced value (muted amber).
                'id-ref': /\w[\w-]*$/,
            },
        },

        // Field names used in selector expressions (SSOT).
        // Plain `tag` (without `=`/`:`) is handled here after `tag-comparison`.
        'selector-field': wordAlt(NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS),

        // Slider group parameter keywords (min / max / step / marks / toggle…) — derived
        // from the parser constant (SSOT). Emitted longest-first so `toggle` does not
        // shadow `toggleside`/`toggledefault`. `default` is also a slider param but is
        // caught by the earlier `default-kw` token; excluded here so it keeps that color.
        // Must precede `field` so these short keywords are colored distinctly rather than
        // falling through to unstyled text (they are not valid assignment-field names).
        'slider-param-kw': wordAltLongestFirst(
            SLIDER_PARAM_KEYWORDS.filter((kw) => kw !== 'default'),
        ),

        // `toggleside=` value keywords (`left` / `above`) — derived from the parser
        // constant (SSOT). Rendered as a boolean-val so the side value reads in the same
        // warm amber family as `toggledefault`'s on/off value. Must precede `field` so
        // bare `above`/`left` are not left unstyled (they are not assignment-field names).
        'slider-toggle-side-val': wordAlt(SLIDER_TOGGLE_SIDE_VALUES),

        // Field names used on the left-hand side of rule assignments (SSOT).
        // Combines recipe-overrides fields and safeguard-overrides fields so both grammars
        // share the same `field` color when highlighted as recipe-overrides (the only grammar
        // used for both block types in the editor backdrop and tooltip).
        'field': wordAlt([
            ...NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS,
            ...NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS,
        ]),

        // Safeguard-overrides activation keyword values (off / protect_existing / anticipate_gaps).
        // Matches after `=` in `activation = <val>` context; rendered as boolean-val so they
        // share the same warm amber hue as recipe-overrides enum values (on/off/toggle/etc.).
        'sg-activation-val': wordAlt(NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS),

        // Safeguard-overrides substat match values (1-4 / persubstat).
        // Rendered as number/boolean-val so they blend with the existing numeric tokens.
        'sg-match-val': wordAlt(NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS),

        // Safeguard-overrides improvchance disable keyword.
        // `off`/`false` are already caught by boolean-val; this covers `disabled` specifically.
        // Rendered in the same warm amber family as the other sg-*-val tokens.
        'sg-improvementchance-val': wordAlt(NOTE_SAFEGUARD_OVERRIDES_IMPROVEMENT_CHANCE_KW_VALS),

        // `$value` / `$count` placeholders used inside slider groups to reference the slider's
        // current value. `$count.TOKEN` references another slider by its explicit id=TOKEN.
        // Both aliases are equal; `$count.TOKEN` cross-slider form is also matched here.
        'sg-value-ref': /\$(?:count(?:\.\w[\w-]*)?|value)\b/,

        // `id=TOKEN` – defines a stable identifier: on an option it names a cross-question
        // target; right after a `q` prompt it PINS the question id (see the parser/EBNF).
        // Split into three inner tokens so the `id` keyword joins the blue structural-keyword
        // family (q, cb, tag) while the defined token name keeps its bright amber.
        'id-assign': {
            pattern: /\bid=\w[\w-]*/,
            inside: {
                // `id` keyword shares the blue shade used for other structural keywords.
                'id-kw': /\bid\b/,
                // The `=` separator is a plain operator.
                'operator': /=/,
                // The defined token name is the amber reserved for definition sites.
                'id-name': /\w[\w-]*$/,
            },
        },

        // `setval token=N [token=N …]` — the one constraint keyword whose arguments are
        // `token=number` pairs rather than bare tokens. Modeled separately (and BEFORE the
        // generic constraint-block) so the whole pair list is consumed as one unit; the
        // generic block would otherwise stop at the first `=` and leave later tokens unstyled.
        'setval-block': {
            pattern: new RegExp(
                `\\b${NOTE_OVERRIDES_SETVAL_KEYWORD}\\b(?:\\s+\\w[\\w-]*\\s*=\\s*\\d+)*`
            ),
            // Greedy so the whole `setval id=n id=n …` run is claimed as one span before
            // value tokens (number / field) can carve out a piece of it mid-stream.
            greedy: true,
            inside: {
                // The `setval` keyword shares the constraint-kw color family.
                'constraint-kw': new RegExp(`\\b${NOTE_OVERRIDES_SETVAL_KEYWORD}\\b`),
                // The `=` separator between a slider id and its forced value.
                'operator': /=/,
                // The forced numeric value.
                'number': /\d+/,
                // Each target slider id (referenced ID, muted amber like other id-refs).
                'id-ref': /\w[\w-]*/,
            },
        },

        // Constraint keywords optionally followed by one or more ID token arguments (SSOT).
        // The nested grammar gives the keyword its own color while each space-separated
        // bare-word argument is colored as an id-ref (used ID), distinct from id-assign.
        // `needs` additionally accepts an optional `=on|off` disabled-state suffix.
        'constraint-block': {
            pattern: new RegExp(
                `\\b(?:${NOTE_RECIPE_OVERRIDES_CONSTRAINT_KEYWORDS.join('|')})\\b(?:\\s*=\\s*\\w+)?(?:\\s+\\w[\\w-]*)*`
            ),
            // Greedy so the keyword + its bare-word id list is claimed as one span. Without
            // this, an earlier value token (e.g. `sg-activation-val` matching the `off` in
            // `needs=off`) carves the string and the trailing ids fall through unstyled.
            greedy: true,
            inside: {
                // The constraint keyword itself.
                'constraint-kw': wordAlt(NOTE_RECIPE_OVERRIDES_CONSTRAINT_KEYWORDS),
                // Optional `=on|off` disabled-state (e.g. `needs=off …`).
                'boolean-val': { pattern: /(=\s*)(?:on|off|true|false)\b/, lookbehind: true },
                'operator': /=/,
                // Each following bare-word is a referenced (used) ID token.
                'id-ref': /\w[\w-]*/,
            },
        },

        // Excluded-add prefix `+-Name` used in list-valued assignment fields
        // (e.g. `gearsets=+-Daze`).  Must precede `shorthand-constraint` and
        // `punctuation` so the whole `+-Name` is consumed as one unit rather than
        // splitting into a gray `+` (punctuation) followed by a separately colored
        // `-Name` constraint fragment.
        'list-excluded-add': {
            pattern: /\+-[a-zA-Z_]\w*/,
            inside: {
                // The `+-` prefix gets the same operator color as shorthand-constraint ops.
                'constraint-op': /^\+-/,
                // The set/stat name is a referenced value (muted amber), same as id-ref.
                'id-ref': /[a-zA-Z_]\w*$/,
            },
        },

        // Symbolic shorthand constraint operators: ! → excl, + → set, - → unset, ^ → only.
        // Optional whitespace between operator and id covers both `!token` and `! token`
        // forms (bug #7 fix). Matches only when the argument starts with a letter so
        // numeric arguments like !14 are excluded.
        // Must precede `punctuation` so the operator character is not consumed first.
        'shorthand-constraint': {
            pattern: /[!+\-^]\s*[a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*/,
            inside: {
                // The single-character operator gets its own color (distinct from the
                // word-form constraint-kw so that `^` / `+` / `-` / `!` visually read
                // as operators rather than keywords).
                'constraint-op': /^[!+\-^]/,
                // Each token name argument is a referenced ID (muted amber).
                'id-ref': /[a-zA-Z_]\w*/,
            },
        },

        // Boolean logic connectors (SSOT).
        'logic-kw': wordAlt(NOTE_RECIPE_OVERRIDES_LOGIC_KEYWORDS),

        // Rarity tier names used as values (SSOT).
        // `any` is also in selector-builtin which precedes this token, so it gets the
        // blue builtin color when used as a bare selector; rarity-name catches it in
        // `rarity=any` assignment context if selector-builtin doesn't match first.
        'rarity-name': wordAlt(NOTE_RECIPE_OVERRIDES_RARITY_NAMES),

        // Enumerated field values: export=, keep=, flex= (SSOT).
        'boolean-val': wordAlt(NOTE_RECIPE_OVERRIDES_ENUM_VALS),

        // Artifact slot names used as values in `slots=` assignments (SSOT).
        // Case-insensitive to match the parser's lowercase normalization.
        'slot-name': new RegExp(`\\b(?:${NOTE_RECIPE_OVERRIDES_SLOT_NAMES.join('|')})\\b`, 'i'),

        // Stat key tokens including percentage variants. Case-insensitive so
        // `weight.spd` highlights the same as `weight.SPD` (parser lowercases).
        'stat-key': /\b(?:HP%?|ATK%?|DEF%?|CR%|CDMG%|ACC|RES|SPD)\b/i,

        // Plain integer literals.
        'number': /\b\d+\b/,

        // Cross-domain block prefix keywords (`safeguard @…` inside recipe-overrides,
        // `recipe @…` inside safeguard-overrides). Colored as structural keywords so they
        // read as block-level delimiters rather than field assignments. Keyword spellings
        // derive from the shared cross-keyword SSOT (also used by the serializer/editor).
        'cross-domain-kw': new RegExp(
            `\\b(?:${Object.values(NOTE_OVERRIDES_CROSS_KEYWORDS).join('|')})\\b(?=\\s*@)`
        ),

        // The `@` sigil used before tag names in selector expressions.
        'selector-at': /@/,

        // Comparison and logical operators.
        // Bare `<` and `>` are intentionally excluded: the parser only accepts `>=`,
        // `<=`, and `=`; coloring standalone `<`/`>` would suggest they are valid (bug #9 fix).
        'operator': />=|<=|&&|\|\||=/,

        // Structural punctuation. `*` is intentionally excluded – it is handled by
        // `default-kw` above so the default-option marker gets its own bright color.
        'punctuation': /[{}[\](),+!:^]/,
    };
}

// Attach required metadata so refractor accepts it as a valid Syntax object.
recipeOverrides.displayName = 'dynamic-overrides';
recipeOverrides.aliases = [] as string[];

// Register the grammar once.
refractor.register(recipeOverrides as Syntax);

// ── note-markers grammar ───────────────────────────────────────────────────
// Minimal grammar for the simpler inline note markers that reference recipes
// or safeguards by index or regex filter, plus the standalone wrapper/structure
// markers (collapse / conditional / prose-language). They all share one grammar so
// every custom `<!--` tag gets the same recognizable colour as `<!-- dungeon-simulator -->`,
// instead of falling through to the generic muted HTML-comment grey:
//   <!-- recipes: 1,0,2 -->
//   <!-- recipes-re: "speed" -->
//   <!-- safeguards: 1,2 -->
//   <!-- safeguards-re: "ring" -->
//   <!-- dungeon-simulator -->
//   <!-- collapse --> … <!-- /collapse -->
//   <!-- if-no-endpoint --> … <!-- /if-no-endpoint -->   (legacy close: <!-- end-if -->)
//   <!-- lang --> … <!-- lang:de --> … <!-- /lang -->

function noteMarkers(Prism: Refractor): void {
    Prism.languages['note-markers'] = {

        // Opening/closing comment delimiters – same muted style as recipe-overrides.
        'comment-delimiter': /^<!--\s*|-->$/,

        // Marker type keyword. `recipes-re` / `safeguards-re` must precede their
        // shorter counterparts to win the first-match race.
        // `dungeon-simulator`, `collapse`, `if-no-endpoint`, and the legacy `end-if`
        // are standalone markers with no arguments. `lang` optionally carries a locale
        // code (`lang:de`, `lang:pt-BR`) which stays inside the keyword so the whole tag
        // reads as one coloured unit; the close form's leading `/` is matched as punctuation.
        'marker-kw': /\b(?:recipes-re|safeguards-re|recipes|safeguards|dungeon-simulator|if-no-endpoint|end-if|collapse)\b|\blang(?::[A-Za-z0-9-]+)?\b/,

        // Quoted regex pattern used in the `-re` filter variants.
        'string': /"(?:\\[\s\S]|[^"\\])*"/,

        // 1-based recipe/safeguard indices, including `0` (next-after-previous).
        'number': /\b\d+\b/,

        // Colon/comma delimiters plus the close-marker slash (`/lang`, `/collapse`).
        'punctuation': /[:,/]/,
    };
}

noteMarkers.displayName = 'note-markers';
noteMarkers.aliases = [] as string[];

// Register the grammar once.
refractor.register(noteMarkers as Syntax);

// ── note-html-span grammar ─────────────────────────────────────────────────
// Minimal grammar for `<span data-color="color">text</span>` inline annotations.
// Produces the html-tag / html-attr-name / html-attr-value / punctuation token
// classes that already map to colours in RECIPE_OVERRIDES_TOKEN_COLORS, giving
// the flyout reference entry the same highlight palette as the surrounding markers.

function noteHtmlSpan(Prism: Refractor): void {
    Prism.languages['note-html-span'] = {
        // Opening tag `<span data-color="…">` — colored as html-tag with inner tokens.
        'html-tag': {
            pattern: /<span\b[^>]*>/,
            inside: {
                // Attribute name.
                'html-attr-name': /\bdata-color\b/,
                // Full `="value"` pair; `=` is punctuation, the quoted value inherits green.
                'html-attr-value': {
                    pattern: /="[^"]*"/,
                    inside: {
                        'punctuation': /^=/,
                    },
                },
                // `<` and `>` delimiters.
                'punctuation': /[<>]/,
            },
        },
        // Closing `</span>` — aliased to html-tag so it shares the coral colour.
        'html-end-tag': {
            pattern: /<\/span>/,
            alias: 'html-tag',
            inside: {
                'punctuation': /[<>/]/,
            },
        },
    };
}

noteHtmlSpan.displayName = 'note-html-span';
noteHtmlSpan.aliases = [] as string[];

refractor.register(noteHtmlSpan as Syntax);

// ── Inject into the markdown grammar ──────────────────────────────────────
// Prepend both block rules to refractor's markdown grammar so that matching
// comment blocks are sub-tokenized with our custom grammars rather than being
// treated as flat HTML comment tokens.
// Must be prepended (Object spread puts them first) so both win over any generic
// html-comment pattern that would otherwise consume the whole block.

const mdGrammar = refractor.languages.markdown;
if (mdGrammar) {
    refractor.languages.markdown = Object.assign(
        {
            // Matches the entire <!-- recipe-overrides … -->, <!-- safeguard-overrides … -->,
            // or <!-- config-options … --> block. All DSLs share the dynamic-overrides grammar
            // so token colors remain identical across marker types.
            'dynamic-overrides-block': {
                pattern: new RegExp(
                    `<!--\\s*(?:${ALL_MARKER_KEYWORDS_PATTERN})\\b[\\s\\S]*?-->`
                ),
                inside: refractor.languages['dynamic-overrides'],
            },
            // Matches inline <!-- recipes: … --> / <!-- recipes-re: "…" --> /
            // <!-- safeguards: … --> / <!-- safeguards-re: "…" --> markers, the standalone
            // <!-- dungeon-simulator --> marker, and the wrapper/structure markers
            // (collapse, if-no-endpoint/end-if, lang) in both their open and `/`-close forms.
            'note-markers-block': {
                pattern: /<!--\s*(?:recipes|safeguards)(?:-re)?\s*:[\s\S]*?-->|<!--\s*\/?(?:dungeon-simulator|collapse|if-no-endpoint|end-if|lang(?::[A-Za-z0-9-]+)?)\s*-->/,
                inside: refractor.languages['note-markers'],
            },
        },
        mdGrammar,
    );
}
