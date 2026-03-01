/**
 * Registers a `recipe-overrides` Prism grammar with the shared refractor instance
 * so that `<!-- recipe-overrides ... -->` and `<!-- config-options ... -->` comment
 * blocks in the note editor are syntax-highlighted in the edit pane.
 *
 * Also registers a `note-markers` grammar for the simpler inline markers:
 *   <!-- recipes: 1,0,2 -->
 *   <!-- recipes-re: "pattern" -->
 *   <!-- safeguards: 1,2 -->
 *   <!-- safeguards-re: "ring" -->
 *
 * Import this module for its side effect only:
 *   import '../lib/prismRecipeOverrides';
 *
 * This module is intentionally side-effect-only (no exports).
 */
/* eslint-disable import/no-unused-modules */

import { refractor } from 'refractor';
import type { Refractor, Syntax } from 'refractor/lib/core.js';
import {
  NOTE_RECIPE_OVERRIDES_QUESTION_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_FALLBACK_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_GROUP_TYPE_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_RARITY_NAMES,
  NOTE_RECIPE_OVERRIDES_ENUM_VALS,
  NOTE_RECIPE_OVERRIDES_SELECTOR_BUILTINS,
  NOTE_RECIPE_OVERRIDES_CONSTRAINT_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_LOGIC_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS,
  NOTE_RECIPE_OVERRIDES_MARKER_LAYOUT_OPTIONS,
  NOTE_RECIPE_OVERRIDES_MARKER_COLUMNS_KEY,
} from './noteRecipeOverrides';

// Build a \b-bounded alternation regex from a keyword array.
// Single source of truth: Prism patterns are derived from parser constants, not
// maintained as parallel hardcoded strings.
const wordAlt = (words: readonly string[]): RegExp => (
  new RegExp(`\\b(?:${words.join('|')})\\b`)
)

// ── marker-option patterns (built from shared constants) ──────────────────
// Derive the marker-option token pattern from the same arrays the parser uses
// so adding a new layout option only requires updating noteRecipeOverrides.ts.
const _markerLayoutAlt = NOTE_RECIPE_OVERRIDES_MARKER_LAYOUT_OPTIONS.join('|')
const _markerColKey    = NOTE_RECIPE_OVERRIDES_MARKER_COLUMNS_KEY
// Matches one option unit: a layout keyword or `columns=N`.
const _markerOptUnit = `(?:${_markerLayoutAlt}|${_markerColKey}=\\d+)`
// Full bracket expression, allowing comma- or space-separated options.
const MARKER_OPTION_PATTERN = new RegExp(
  `\\[\\s*(?:${_markerOptUnit}(?:[,\\s]+${_markerOptUnit})*)\\s*\\]`
)
// Inner keyword pattern for the marker-option-kw sub-token.
const MARKER_OPTION_KW_PATTERN = new RegExp(
  `\\b(?:${_markerLayoutAlt}|${_markerColKey})\\b`
)

// ── recipe-overrides grammar ───────────────────────────────────────────────
// Tokens are ordered from most-specific to least-specific so that Prism's
// greedy/first-match logic picks the right class when tokens overlap.

/** The grammar function typed as a refractor Syntax object. */
function recipeOverrides(Prism: Refractor): void {
    Prism.languages['recipe-overrides'] = {

        // Opening/closing comment delimiters.  The `<!--` / `-->` scaffolding
        // is colored as a structural bracket; the directive keyword inside
        // (recipe-overrides / config-options) gets the same hue as note-markers
        // keywords so every block-trigger reads as one family.
        'comment-delimiter': {
            pattern: /^<!--\s*(?:recipe-overrides|config-options)\b|-->$/,
            inside: {
                'directive-kw': /(?:recipe-overrides|config-options)/,
            },
        },

        // Quoted string literals (e.g. display labels for questions).
        // Marked greedy so that `// …` or `/* … */` sequences inside a string are not
        // claimed by the comment tokens below before the string itself is matched.
        // `inside` handles inline markup: **bold** emphasis and `chip` references.
        'string': {
            pattern: /"(?:\\[\s\S]|[^"\\])*"/,
            greedy: true,
            inside: {
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

        // Inline marker-option block, e.g. [wholeline], [columns=3], or combined
        // [wholeline columns=4] / [wholeline,columns=4].
        // Pattern is built from shared parser constants (SSOT).
        // Uses `inside` so each piece gets its own color rather than one flat hue:
        //   marker-option-kw  – option keyword name (wholeline, columns)
        //   operator          – the `=` separator
        //   number            – the numeric column count
        //   punctuation       – brackets and commas
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

        // Field names used on the left-hand side of rule assignments (SSOT).
        'field': wordAlt(NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS),

        // `id=TOKEN` – defines a stable cross-question option identifier.
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

        // Constraint keywords optionally followed by one or more ID token arguments (SSOT).
        // The nested grammar gives the keyword its own color while each space-separated
        // bare-word argument is colored as an id-ref (used ID), distinct from id-assign.
        'constraint-block': {
            pattern: new RegExp(
                `\\b(?:${NOTE_RECIPE_OVERRIDES_CONSTRAINT_KEYWORDS.join('|')})\\b(?:\\s+\\w[\\w-]*)*`
            ),
            inside: {
                // The constraint keyword itself.
                'constraint-kw': wordAlt(NOTE_RECIPE_OVERRIDES_CONSTRAINT_KEYWORDS),
                // Each following bare-word is a referenced (used) ID token.
                'id-ref': /\w[\w-]*/,
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

        // Stat key tokens including percentage variants.
        'stat-key': /\b(?:HP%?|ATK%?|DEF%?|CR%|CDMG%|ACC|RES|SPD)\b/,

        // Plain integer literals.
        'number': /\b\d+\b/,

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
recipeOverrides.displayName = 'recipe-overrides';
recipeOverrides.aliases = [] as string[];

// Register the grammar once.
refractor.register(recipeOverrides as Syntax);

// ── note-markers grammar ───────────────────────────────────────────────────
// Minimal grammar for the simpler inline note markers that reference recipes
// or safeguards by index or regex filter:
//   <!-- recipes: 1,0,2 -->
//   <!-- recipes-re: "speed" -->
//   <!-- safeguards: 1,2 -->
//   <!-- safeguards-re: "ring" -->

function noteMarkers(Prism: Refractor): void {
    Prism.languages['note-markers'] = {

        // Opening/closing comment delimiters – same muted style as recipe-overrides.
        'comment-delimiter': /^<!--\s*|-->$/,

        // Marker type keyword. `recipes-re` / `safeguards-re` must precede their
        // shorter counterparts to win the first-match race.
        'marker-kw': /\b(?:recipes-re|safeguards-re|recipes|safeguards)\b/,

        // Quoted regex pattern used in the `-re` filter variants.
        'string': /"(?:\\[\s\S]|[^"\\])*"/,

        // 1-based recipe/safeguard indices, including `0` (next-after-previous).
        'number': /\b\d+\b/,

        // Colon separator and comma list delimiter.
        'punctuation': /[:,]/,
    };
}

noteMarkers.displayName = 'note-markers';
noteMarkers.aliases = [] as string[];

// Register the grammar once.
refractor.register(noteMarkers as Syntax);

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
            // Matches the entire <!-- recipe-overrides … --> or <!-- config-options … --> block.
            'recipe-overrides-block': {
                pattern: /<!--\s*(?:recipe-overrides|config-options)\b[\s\S]*?-->/,
                inside: refractor.languages['recipe-overrides'],
            },
            // Matches inline <!-- recipes: … --> / <!-- recipes-re: "…" --> /
            // <!-- safeguards: … --> / <!-- safeguards-re: "…" --> markers.
            'note-markers-block': {
                pattern: /<!--\s*(?:recipes|safeguards)(?:-re)?\s*:[\s\S]*?-->/,
                inside: refractor.languages['note-markers'],
            },
        },
        mdGrammar,
    );
}
