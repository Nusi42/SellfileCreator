const RECIPE_NAME_COLOR_DIRECTIVE_PATTERN = /^\s*(#\s*)?\[\s*#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\s*\]/

export type RecipeNameDecoration = {
  displayName: string
  resolvedColor: string
  hasExplicitColor: boolean
}

// Recipe names may start with [rrggbb]; we reuse that tag to color chips consistently.
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
