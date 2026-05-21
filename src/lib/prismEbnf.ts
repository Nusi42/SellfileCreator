/**
 * Registers a minimal `ebnf` Prism grammar with the shared refractor instance.
 *
 * Used exclusively to render EBNF formal-syntax blocks in NoteDialog tooltips.
 * Intentionally omits all DSL-domain tokens (keywords, fields, operators, etc.)
 * so EBNF production-rule names stay unstyled and don't accidentally pick up
 * DSL colors from the recipe-overrides grammar.
 *
 * Import for side effect only:
 *   import '../lib/prismEbnf';
 */
/* eslint-disable import/no-unused-modules */

import { refractor } from 'refractor'
import type { Refractor, Syntax } from 'refractor/core'

function ebnf(Prism: Refractor): void {
  Prism.languages['ebnf'] = {
    // Quoted terminal strings — green, same hue as recipe-overrides strings.
    'string': {
      pattern: /"(?:\\[\s\S]|[^"\\])*"/,
      greedy: true,
    },

    // Single-line comments (`// …`).  After `string` so quotes inside strings
    // are already consumed before the double-slash is tested.
    'line-comment': /\/\/.*$/m,

    // Informal regex / pattern descriptions written as /…/ in EBNF comments.
    // Colored amber, distinct from line-comment gray, to make them stand out.
    // The negative lookbehind prevents matching the second `/` of `//`.
    'regex-literal': {
      pattern: /(?<!\/)\/[^/\n]+\//,
      greedy: true,
    },

    // `:=` assignment and `|` alternation.
    'operator': /:=|\|/,

    // Structural grouping punctuation: {}, (), [], and EBNF repeat markers * + ?.
    'punctuation': /[{}()[\]*+?]/,
  }
}

ebnf.displayName = 'ebnf'
ebnf.aliases = [] as string[]

refractor.register(ebnf as Syntax)
