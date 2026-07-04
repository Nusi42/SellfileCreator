/**
 * documentOverrides.ts
 *
 * SSOT for the note-override derivation chain: document (recipes, safeguards, note,
 * substat targets) + session answers → the override-applied views every consumer of
 * "effective" rules must use. App.tsx renders through this exact builder, and the
 * background account-push flow (lib/backgroundAccountPush.ts) builds a non-active
 * account's sellfile through it — one definition, no drift. Do NOT re-derive any of
 * these steps inline elsewhere; extend this builder instead.
 */
import type { BuilderRecipe, SellfileExportMode, SubstatTargetTable } from './hsfBuilder'
import type { Metaset } from './metasets'
import type { SafeguardRule } from './safeguards'
import { resolveSafeguardRulesWithMetasets } from './safeguards'
import {
  applyRecipeOverrides,
  applyRecipeOverridesSubstatTargetsOverrides,
  buildRecipeOverridesExportModeResolution,
  resolveRecipeOverridesTags,
  type NoteRecipeOverridesAnswers,
} from './noteRecipeOverrides'
import {
  applySafeguardOverrides,
  resolveNoteSafeguardOverridesTags,
  type NoteSafeguardOverridesAnswers,
} from './noteSafeguardOverrides'
import { recipesForRuleBuild, recipeNamesForExport } from './ruleCacheHelpers'

// Resolution result types are inferred from the resolvers so this module never
// restates (and risks drifting from) their shapes.
export type RecipeOverridesResolution = ReturnType<typeof resolveRecipeOverridesTags>
export type NoteSafeguardOverridesResolution = ReturnType<typeof resolveNoteSafeguardOverridesTags>

export type DocumentOverridesInput = {
  // Raw note text (nullable) — the gate below normalizes it for the parsers.
  note: string | null | undefined
  // Master kill switch: true suppresses ALL override effects (display + pipeline).
  noteOverridesDisabled: boolean
  recipeOverridesAnswers: NoteRecipeOverridesAnswers
  safeguardOverridesAnswers: NoteSafeguardOverridesAnswers
  // Raw document state, exactly as stored in the SFC (never mutated here).
  recipes: BuilderRecipe[]
  substatTargets: SubstatTargetTable
  safeguardRules: SafeguardRule[]
  metasets: Metaset[]
  // Master "Recipes" toggle: false empties the pipeline recipe list (rules preview shows
  // only base HSF/safeguards). Part of the document, so it gates here in the SSOT.
  recipesEnabled: boolean
}

export type DocumentOverridesView = {
  // Raw resolutions — App consumes their instruction lists for UI (chips, diagnostics).
  recipeOverridesResolution: RecipeOverridesResolution
  safeguardOverridesResolution: NoteSafeguardOverridesResolution
  // Native recipe instructions + cross-domain ones from safeguard-overrides questions.
  effectiveRecipeInstructions: RecipeOverridesResolution['instructions']
  // Per-recipe export-mode resolution (drives recipeModes fed to the pipeline).
  recipeOverridesExportModes: ReturnType<typeof buildRecipeOverridesExportModeResolution>
  recipeModes: SellfileExportMode[]
  // Override-applied recipes for preview/rule consumers (SFC recipes untouched).
  recipeOverridesRecipesForRules: BuilderRecipe[]
  // Substat targets with recipe-override substat-target overrides applied.
  substatTargetsResolution: ReturnType<typeof applyRecipeOverridesSubstatTargetsOverrides>
  effectiveSubstatTargets: SubstatTargetTable
  substatTargetsOverridesActive: boolean
  // The recipe list actually fed to the rule-cache pipeline (build-normalized).
  ruleRecipes: BuilderRecipe[]
  // ruleRecipes gated by the master Recipes toggle — the pipeline's `recipes` input.
  pipelineRecipes: BuilderRecipe[]
  // Names written into exported HSF rows — MUST come from ruleRecipes (the same
  // override-applied list the worker fingerprints) so export bytes match the worker crc.
  exportRecipeNames: string[]
  // Safeguards: metaset-resolved rules, then overrides applied for the pipeline...
  resolvedSafeguardRules: SafeguardRule[]
  effectiveSafeguardInstructions: NoteSafeguardOverridesResolution['instructions']
  // Readonly: applySafeguardOverrides returns frozen views; consumers never mutate them.
  effectiveSafeguardRules: readonly SafeguardRule[]
  // ...and the same overrides on the RAW rules for display (metasets kept as names).
  displaySafeguardRules: readonly SafeguardRule[]
}

// The note gate: overrides parse only from a real string note while not disabled.
// Shared by both resolver calls (App previously wrote this expression twice).
export const resolveOverridesNoteText = (
  note: string | null | undefined,
  noteOverridesDisabled: boolean,
): string => (!noteOverridesDisabled && typeof note === 'string' ? note : '')

/**
 * Run the full override chain in the canonical order. Pure: inputs are never
 * mutated, so the result can be memoized on shallow input identity.
 */
export const buildDocumentOverridesView = (input: DocumentOverridesInput): DocumentOverridesView => {
  const noteText = resolveOverridesNoteText(input.note, input.noteOverridesDisabled)
  // Resolve both domains' tag actions from the same gated note text.
  const recipeOverridesResolution = resolveRecipeOverridesTags(noteText, input.recipeOverridesAnswers)
  const safeguardOverridesResolution = resolveNoteSafeguardOverridesTags(noteText, input.safeguardOverridesAnswers)
  // Merge native recipe instructions with cross-domain ones from safeguard questions.
  const effectiveRecipeInstructions = [
    ...recipeOverridesResolution.instructions,
    ...safeguardOverridesResolution.recipeInstructions,
  ]
  // Export modes + override-applied recipes + substat-target overrides, all against
  // the RAW recipe list (instructions address recipes by their stored identity).
  const recipeOverridesExportModes = buildRecipeOverridesExportModeResolution(input.recipes, effectiveRecipeInstructions)
  const recipeOverridesRecipesForRules = applyRecipeOverrides(input.recipes, effectiveRecipeInstructions)
  const substatTargetsResolution = applyRecipeOverridesSubstatTargetsOverrides(
    input.substatTargets,
    input.recipes,
    effectiveRecipeInstructions,
  )
  // Build-normalized recipe list — the pipeline input AND the export-name source.
  const ruleRecipes = recipesForRuleBuild(recipeOverridesRecipesForRules)
  // Master toggle off → the pipeline sees no recipes (base HSF/safeguards only).
  const pipelineRecipes = input.recipesEnabled ? ruleRecipes : []
  const exportRecipeNames = recipeNamesForExport(ruleRecipes)
  // Safeguard side: metaset expansion first, then overrides for the pipeline;
  // the display view applies the same overrides to the raw (unexpanded) rules.
  const resolvedSafeguardRules = resolveSafeguardRulesWithMetasets(input.safeguardRules, input.metasets)
  const effectiveSafeguardInstructions = [
    ...safeguardOverridesResolution.instructions,
    ...recipeOverridesResolution.safeguardInstructions,
  ]
  const effectiveSafeguardRules = applySafeguardOverrides(resolvedSafeguardRules, effectiveSafeguardInstructions)
  const displaySafeguardRules = applySafeguardOverrides(input.safeguardRules, effectiveSafeguardInstructions)
  return {
    recipeOverridesResolution,
    safeguardOverridesResolution,
    effectiveRecipeInstructions,
    recipeOverridesExportModes,
    recipeModes: recipeOverridesExportModes.modes,
    recipeOverridesRecipesForRules,
    substatTargetsResolution,
    effectiveSubstatTargets: substatTargetsResolution.substatTargets,
    substatTargetsOverridesActive: substatTargetsResolution.overridesActive,
    ruleRecipes,
    pipelineRecipes,
    exportRecipeNames,
    resolvedSafeguardRules,
    effectiveSafeguardInstructions,
    effectiveSafeguardRules,
    displaySafeguardRules,
  }
}
