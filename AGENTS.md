# AI Agent Guidelines

This document summarizes how we collaborate on Sellfile Creator. Detailed technical references live in [`docs/TECHNICAL.md`](docs/TECHNICAL.md); that index links to (and may contain) additional guidance beyond the highlights mentioned here.

## Objectives

- Deliver a reliable, minimal app for generating RSL Helper sell files.
- Keep scope tight — ship the requested behavior without speculative add-ons.
- Prefer clarity, safety, and testability over shortcuts.

## Working Agreements

- TypeScript-first with strict types; avoid `any` unless the type system cannot describe the value. Reuse exported domain enums/tokens (see `docs/technical/rules-and-data.md`).
- Single source of truth: centralize constants and catalogs, then import them. If multiple places need the same literal, promote it to a shared constant.
- Comments and docs must reflect the *current* state. Update or remove anything that has drifted, even if the surrounding code was not otherwise touched.
- Keep modules focused and diffs small. Follow existing patterns before introducing new abstractions, unless doing so would violate the single-source-of-truth / One Definition Rule—then factor the shared abstraction instead of duplicating logic.
- UI code must keep parallel entry points in sync (e.g., toggles, badges, multi-edit). Shared helpers exist for a reason — extend them, don't fork them.

## Workflow Expectations

- Propose a brief plan before sizable changes and update it as work progresses.
- For code changes, run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` before handoff; fix regressions instead of punting them downstream.
- Remove exploratory logs, diagnostics, and scaffolding once the fix is validated. If a commit is requested while any remain, pause and obtain explicit user confirmation before proceeding.
- Before committing, review earlier iterations and drop any obsolete changes that no longer apply after corrective prompts.
- Update docs when behavior, datasets, or workflows change. Add or edit entries in `docs/TECHNICAL.md` (and create new referenced files when needed) without waiting for an explicit user request.
- Treat the git history as immutable unless the user tells you otherwise. You **must not** stage, commit, amend, revert, or otherwise write to the repository unless the current prompt explicitly authorizes that exact action. A past “please commit” does **not** carry forward; if the user wants additional commits they will say so. When in doubt, ask—never assume permission.

## Safety & Data

- Align exports with the sample `.hsf` files under `samples/orig/`; do not guess at schema changes.
- Avoid destructive commands (mass deletes, force resets) unless the user explicitly requests them.
- Request elevated permissions before taking privileged filesystem or network actions.

## Further Reference

- Start with [`docs/TECHNICAL.md`](docs/TECHNICAL.md). It aggregates the full technical documentation set and may include additional topics or updates beyond the categories called out here.

Stay concise, keep users informed, and prefer incremental, well-tested changes.
