/**
 * readmeClientName.ts
 *
 * Adapt the README's client references for the Help dialog (SSOT).
 *
 * The README files ship BOTH as standalone documents (distributed to users as-is, and read
 * on GitHub) and as the in-app Help/README screen. They must keep saying "RSL Helper" on
 * disk, so the substitution happens at RENDER time only — the same place HelpDialog already
 * strips the H1 and injects the version badge. Nothing here writes to a file.
 *
 * Only references to the CONNECTED CLIENT are rewritten. Three categories are deliberately
 * left literal, because rewriting them would be wrong rather than merely inconsistent:
 *
 *  1. The `.hsf` FORMAT NAME ("RSL Helper Sellfile"). The format is RSL Helper's regardless
 *     of which client pushes it — the name describes the format, not the peer.
 *  2. ATTRIBUTION and legal text: the trademark disclaimer and the credit to Farbstoff name
 *     real entities. Renaming them would misattribute authorship.
 *  3. Literal IDENTIFIERS: filenames, paths, and the H1 title HelpDialog matches on.
 *
 * When no client has named itself the result is identical to the input, so the default
 * launch renders the README exactly as written.
 */
import { DEFAULT_CLIENT_NAME, getClientName } from './runtimeConfig'

/**
 * Spans that must survive verbatim, matched before any substitution runs.
 *
 * Ordered longest-context-first so a broader phrase claims its text before a narrower one
 * can: "RSL Helper Sellfile" must win over the bare name inside it. Each pattern is global —
 * every occurrence is protected, not just the first.
 */
const PROTECTED_PATTERNS: readonly RegExp[] = [
  // The .hsf format name. Word order and connectors differ per language, so both orders are
  // matched with an optional short connective between them:
  //   EN/DE/TR  "RSL Helper Sellfile"   (TR also suffixes: "Sellfile'ı")
  //   RU/UK     "Sellfile RSL Helper"
  //   ES/PT/IT  "Sellfile de RSL Helper" / "Sellfile do RSL Helper" / "Sellfile di RSL Helper"
  // The connector is capped at one short word so it cannot swallow a whole clause, and
  // genitive-only: "Sellfile de/di/do/da RSL Helper" names the FORMAT, whereas
  // "Sellfiles for/für/pour/para RSL Helper" describes files built FOR the client and must
  // adapt. Listing the genitives explicitly keeps those two readings apart.
  /Sellfiles?[’'`´]?\w*\s+(?:d[eioa]|del|della|do|da)\s+RSL\s+Helper/gi,
  /Sellfiles?[’'`´]?\w*\s+RSL\s+Helper/gi,
  /RSL\s+Helper\s+Sellfiles?[’'`´]?\w*/gi,
  // Trademark disclaimer. Matched STRUCTURALLY rather than per language: every translation
  // names Plarium and Raid: Shadow Legends alongside the client, so anchoring on those two
  // proper nouns covers all ten files (and any future translation) without needing a phrase
  // list that would silently miss a language.
  /Plarium[^.\n]*RSL\s+Helper/gi,
  // Author credit. Every translation puts the **Farbstoff** marker before the client name,
  // so the bold marker is the anchor — the surrounding preposition differs per language.
  /\*\*Farbstoff\*\*[^.\n!]*RSL\s+Helper/gi,
  // Anything inside backticks is a literal identifier (filenames, paths, commands).
  /`[^`\n]*`/g,
  // Markdown link targets and bare paths must never be rewritten.
  /\]\([^)\n]*\)/g,
  // The H1 title, which HelpDialog matches by exact text to strip it (READMEs open with a
  // BOM, hence the optional prefix).
  /^\uFEFF?#\s*Sellfile Creator for RSL Helper.*$/gim,
]

// Matches a client reference: the bare product name plus any trailing suffix a language
// glues on ("RSL Helper'a", "RSL Helper'ın"). The suffix is dropped with the name, because
// a different client name would need a different suffix and we cannot inflect for it.
const CLIENT_REFERENCE = /RSL\s+Helper(?:[’'`´]\w+)?/g

// Sentinel bracketing protected spans while the substitution runs. Private-use-area code
// points cannot appear in README markdown, so a parked span never collides with real
// content — and unlike U+0000 they are not flagged as irregular whitespace.
const GUARD_OPEN = '\uE000'
const GUARD_CLOSE = '\uE001'

/**
 * Rewrite the README's client references to `clientName` for display.
 *
 * Exported with an explicit name parameter so tests can drive it without a DOM; the
 * `forDisplay` wrapper below is what the dialog calls.
 */
export function adaptReadmeClientReferences(readme: string, clientName: string): string {
  // Nothing to do when the client is the one the README already names — the overwhelmingly
  // common case, so it costs a single comparison.
  if (!readme || clientName === DEFAULT_CLIENT_NAME) return readme

  // 1. Park every protected span behind an index, so the substitution cannot see it.
  const parked: string[] = []
  let guarded = readme
  for (const pattern of PROTECTED_PATTERNS) {
    guarded = guarded.replace(pattern, (match) => {
      parked.push(match)
      return `${GUARD_OPEN}${parked.length - 1}${GUARD_CLOSE}`
    })
  }

  // 2. Every remaining mention is a reference to the connected client. A function
  // replacement keeps a name containing `$&`/`$1` literal.
  const substituted = guarded.replace(CLIENT_REFERENCE, () => clientName)

  // 3. Restore the parked spans verbatim.
  return substituted.replace(
    new RegExp(`${GUARD_OPEN}(\\d+)${GUARD_CLOSE}`, 'g'),
    (_, index: string) => parked[Number(index)] ?? '',
  )
}

/** Dialog-facing form: adapts the README to whichever client is currently connected. */
export function adaptReadmeForDisplay(readme: string): string {
  return adaptReadmeClientReferences(readme, getClientName())
}
