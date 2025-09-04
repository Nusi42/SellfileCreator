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
- Always write comments ("why, not how") that explain the current state.
- Avoid comments about removed/obsolete code; rely on git history for past context.
- Do not add comments about former/removed functionality anywhere (code or docs/TECHNICAL.md). When removing or changing behavior, remove outdated mentions and keep comments/docs strictly about current behavior.
- When encountering un-commented code or outdated/misleading comments (including dead code), add or correct comments to reflect current behavior.

## Workflow

- Propose a brief plan before large changes; keep users informed.
- When adding files, update README or in-file docs as needed.
- Use meaningful names; avoid one-letter variables.
- Prefer pure functions for rule evaluation and data transforms.
- Always run `npm run typecheck`, `npm run lint`, and `npm run build` before handing off changes and fix any issues found.

## Safety & Data

- Do not assume RSL Helper formats; prefer aligning to provided `.hsf` samples.
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

## Communication

- Be concise and actionable; highlight assumptions and next steps.
- If blocked by missing info (e.g., sell-file schema), request an example.

## Code Organization

- Keep HSF schema types in `src/lib/hsfTypes.ts` and the parser in `src/lib/hsf.ts`.
- Centralize shared catalogs/formatters (sets, types, rarity, rank, level, stat labels) in `src/lib/types.ts`.
- Keep builder permutations and substat threshold logic in `src/lib/hsfBuilder.ts` (minima sourced from `ARTIFACT_RULES.md`).
- Avoid duplicate catalogs across files. Update README when formats change.

## Documentation

- README.md is user-facing for very non‑technical users. Keep it simple, focused on current features and usage. Do not include internal details, changelogs, or references to former/removed functionality.
- docs/TECHNICAL.md is developer-facing. Keep it accurate to the current implementation and behavior only. Do not document past/removed features; rely on git history for historical context.
- Code comments should explain intent (why) for the current state only; do not embed history of removed code or prior designs.
