/**
 * Display appearance for a named item (recipe or safeguard rule).
 * Bundles name and optional foreground color so callers cannot pass one without the other.
 */
export type NameAppearance = {
  /** Display name shown in chips, builders, and gear-inspector panels. */
  name: string
  /** Optional foreground hex color, e.g. "#FF5733". Absent means inherit from theme. */
  fgColor?: string
}
