# AI Agent Ruleset

Guidelines for the AI assistant collaborating on this project.

## Objectives

- Build a reliable, minimal app to generate RSL Helper sell files.
- Keep scope tight; avoid speculative features unless requested.
- Prefer clarity, safety, and testability over shortcuts.

## Style & Quality

- TypeScript-first, strict types; no `any` unless justified.
- Small, focused modules; avoid deep abstractions early.
- Follow existing patterns; keep diffs minimal and targeted.
- No licenses/headers unless requested; no unrelated refactors.
- Always write comments that explain the current state.
- Avoid comments about removed/obsolete code; rely on git history for past context.
- Do not add comments about former/removed functionality anywhere (code or `docs/TECHNICAL.md`). When removing or changing behavior, remove outdated mentions and keep comments/docs strictly about current behavior.
- When encountering un-commented code or outdated/misleading comments (including dead code), add or correct comments to reflect current behavior.
- If the same number must be used in different places, it should be extracted into a constant, enum, or enum string (centralize once; import where needed).
- When you notice a value that should be centralized but isn’t, proactively refactor to extract a shared constant/enum and update all usages with a minimal, focused change (add comments only about the current behavior).
- If a value is a calculation of constants, keep it expressed as that calculation (e.g., `const CELL = PADDING + ICON;`) instead of inlining the numeric result. This preserves intent and makes later adjustments safer.
- Prefer explicit domain types over primitives:
  - Use `StatVariant` instead of historical `{ id: number, f|flat|isFlat: boolean }` pairs throughout the app code. Treat `StatVariant` as an opaque token — do not check or rely on its numeric value; use helper functions for mapping/formatting.
  - Replace generic `number`/`string` with existing explicit enums and types (`RankCode`, `RarityCode`, `ArtifactTypeId`, `Faction`, etc.) where applicable.
  - Only convert to/from `{ id, flat }` when reading or writing HSF files. The HSF file format is fixed and MUST NOT be modified. Keep these conversions isolated at IO boundaries.

## Workflow

- Propose a brief plan before large changes; keep users informed.
- When adding files, update `docs/TECHNICAL.md` as needed.
- Use meaningful names; avoid one-letter variables.
- Prefer pure functions for rule evaluation and data transforms.
 - For code changes, run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:hsfr` before handoff and fix any issues found. For docs‑only changes, you can skip these checks.

## Safety & Data

- Do not assume RSL Helper formats; prefer aligning to provided `.hsf` samples in `samples/orig/`.
- Avoid destructive actions; never mass-delete without user confirmation.
- Keep network and file system access minimal; ask before using elevated permissions.

## Rules Engine

- Evaluate rules in order; first match wins.
- Provide a `strategy` fallback: `blacklist` (keep by default) or `whitelist` (sell by default).
- Keep rule filters explicit and composable; avoid hidden heuristics.

Known mappings (from samples):
- Rank codes (0–16): All; 1*..6*; >=1*..>=5*; <=2*..<=6*.
- Rarity codes (0–16): All; Common..Mythical; >=Common..>=Legendary; <=Uncommon..<=Mythical.
- Level: `99` means Any level; `0/4/8/12/16` render as `+N`.
- `flatSubstatsOk` = any of flat `hp`, `atk`, or `def`.

Read `docs/ARTIFACT_RULES.md` for how gear in RSL (Raid Shadow Legends) is leveled up.

## Communication

- Be concise and actionable; highlight assumptions and next steps.
- If blocked by missing info (e.g., sell-file schema), request an example.

## Code Organization

- Single source of truth! No code or logic duplication!.
- One Definition Rules!.

Read and/or update `docs/TECHNICAL.md` when relevant or when prompts request specific general coding style changes.

## Documentation

- `README.md` is user-facing for very non‑technical users. Keep it simple, focused on current features and usage. Do not include internal details, changelogs, or references to former/removed functionality. Using RSL lingo is allowed.
- `docs/TECHNICAL.md` is developer-facing. Keep it accurate to the current implementation and behavior only. Do not document past/removed features; rely on git history for historical context.
- Code comments should explain intent for the current state only; do not embed history of removed code or prior designs.
