/**
 * Legacy wire-format parser for color directives embedded in name strings.
 * Called ONLY during SFC load (sfcIO.ts, safeguards.ts) to migrate old files.
 * Display code must NOT call this — use recipe.appearance / rule.appearance directly.
 */
const RECIPE_NAME_COLOR_DIRECTIVE_PATTERN = /^\s*(#\s*)?\[\s*#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\s*\]/

export type RecipeNameDecoration = {
  displayName: string
  resolvedColor: string
  hasExplicitColor: boolean
}

export function parseRecipeNameDirectives(rawName: string | undefined, fallbackColor: string): RecipeNameDecoration {
  const source = rawName ?? ''
  const match = source.match(RECIPE_NAME_COLOR_DIRECTIVE_PATTERN)
  if (!match || !match[2]) {
    return { displayName: source, resolvedColor: fallbackColor, hasExplicitColor: false }
  }
  const displayName = source.slice(match[0].length).trimStart()
  return { displayName, resolvedColor: `#${match[2].toUpperCase()}`, hasExplicitColor: true }
}

export { RECIPE_NAME_COLOR_DIRECTIVE_PATTERN }
