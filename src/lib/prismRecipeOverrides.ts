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
        // Uses `inside` so each piece gets its own color rather than one flat hue:
        //   marker-option-kw  – option keyword name (wholeline, columns)
        //   operator          – the `=` separator
        //   number            – the numeric column count
        //   punctuation       – brackets and commas
        'marker-option': {
            pattern: /\[\s*(?:(?:wholeline|columns=\d+)(?:[,\s]+(?:wholeline|columns=\d+))*)\s*\]/,
            inside: {
                // Option keyword names – teal, same family as field names.
                'marker-option-kw': /\b(?:wholeline|columns)\b/,
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

        // `q` / `question` – the keyword that introduces an interactive question.
        'question-kw': /\b(?:q|question)\b/,

        // Group-type tokens – how answers within a question are presented.
        'group-type': /\b(?:single|s|radiobutton|radio|rb|multi|m|checkbox|check|cb)\b/,

        // `fallback` / `else` – introduces the default answer branch.
        'fallback-kw': /\b(?:fallback|else)\b/,

        // Built-in collection selectors (`all`, `tagged`, `untagged`).
        'selector-builtin': /\b(?:all|tagged|untagged)\b/,

        // `tag=TOKEN` – captures the full tag-equality expression so the user-supplied
        // tag value gets its own color.  Must precede `selector-field` so `tag=value`
        // is consumed here before `tag` alone is claimed by `selector-field`.
        'tag-comparison': {
            pattern: /\btag\s*=\s*\w[\w-]*/,
            inside: {
                // The `tag` keyword remains in the blue selector-field family.
                'selector-field': /\btag\b/,
                // The `=` separator is a plain operator.
                'operator': /=/,
                // The user-supplied tag name is a referenced value (muted amber).
                'id-ref': /\w[\w-]*$/,
            },
        },

        // Field names used in selector expressions (e.g. `tag`, `rank`, …).
        // Plain `tag` (without `=`) is handled here after `tag-comparison` takes precedence.
        'selector-field': /\b(?:tag|rank|rarity|minrolls|minsubstats|flex)\b/,

        // Field names used on the left-hand side of rule assignments.
        'field': /\b(?:export|rank|rarity|lvl|keep|autolate|minrolls|lockedminrolls|minsubstats|flex|substatmin|minima)\b/,

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

        // Constraint keywords optionally followed by one or more ID token arguments.
        // The nested grammar gives the keyword its own color while each space-separated
        // bare-word argument is colored as an id-ref (used ID), distinct from id-assign.
        'constraint-block': {
            pattern: /\b(?:set|unset|only|excl)\b(?:\s+\w[\w-]*)*/,
            inside: {
                // The constraint keyword itself.
                'constraint-kw': /\b(?:set|unset|only|excl)\b/,
                // Each following bare-word is a referenced (used) ID token.
                'id-ref': /\w[\w-]*/,
            },
        },

        // Symbolic shorthand constraint operators: ! → excl, + → set, - → unset, ^ → only.
        // Matches only when the argument starts with a letter so numeric arguments like !14
        // are excluded (they keep `!` as punctuation and `14` as number color).
        // Must precede `punctuation` so the operator character is not consumed first.
        'shorthand-constraint': {
            pattern: /[!+\-^][a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*/,
            inside: {
                // The single-character operator gets its own color (distinct from the
                // word-form constraint-kw so that `^` / `+` / `-` / `!` visually read
                // as operators rather than keywords).
                'constraint-op': /^[!+\-^]/,
                // Each token name argument is a referenced ID (muted amber).
                'id-ref': /[a-zA-Z_]\w*/,
            },
        },

        // Boolean logic connectors.
        'logic-kw': /\b(?:and|or)\b/,

        // Rarity tier names used as values.
        'rarity-name': /\b(?:common|uncommon|rare|epic|legendary|mythical|auto)\b/,

        // Boolean / toggle values.
        'boolean-val': /\b(?:true|false|on|off|active|disabled|toggle)\b/,

        // Stat key tokens including percentage variants.
        'stat-key': /\b(?:HP%?|ATK%?|DEF%?|CR%|CDMG%|ACC|RES|SPD)\b/,

        // Plain integer literals.
        'number': /\b\d+\b/,

        // The `@` sigil used before tag names in selector expressions.
        'selector-at': /@/,

        // Comparison and logical operators.
        'operator': />=|<=|&&|\|\||[=<>]/,

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
