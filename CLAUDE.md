# Claude Code Guidelines

This document summarizes how we collaborate on Sellfile Creator. Detailed technical references live in [`docs/TECHNICAL.md`](docs/TECHNICAL.md); that index links to (and may contain) additional guidance beyond the highlights mentioned here.

## Objectives

- Deliver a reliable, minimal app for generating RSL Helper sell files.
- Keep scope tight — ship the requested behavior without speculative add-ons.
- Prefer clarity, safety, and testability over shortcuts.

## Working Agreements

- TypeScript-first with strict types; avoid `any` unless the type system cannot describe the value. Reuse exported domain enums/tokens (see `docs/technical/rules-and-data.md`).
- Maintain dense, purposeful inline documentation—new or updated code should average a short comment every 2–3 lines to explain intent, not mechanics.
- Single source of truth / One Definition Rule is a hard gate: every shared literal, behavior, or logic expression must have exactly one exported definition — import it everywhere else. Writing the same condition or computation in a second place, even inline, is the same violation as duplicating a constant; extract a named function first.
- Comments and docs must reflect the *current* state. Update or remove anything that has drifted, even if the surrounding code was not otherwise touched.
- When adding console debug output to help diagnose an issue alongside the user, log formatted primitives (e.g. ``console.log(`[builder-count] pending=${pendingId}`)``) instead of passing raw objects — DevTools collapses objects and they do not copy usefully into chat.
- Cap files at roughly 1,500 lines; split large modules (without breaking SSOT) before they become unwieldy.
- **i18n catalog edits — use double-quoted strings**: Catalog values use TypeScript double-quoted strings (`"..."`). This eliminates the Unicode apostrophe trap — U+2019 (`'`) in languages like Ukrainian is harmless inside double quotes. When adding new entries, use double quotes for values. If a value contains a literal `"`, escape it as `\"`.
- Keep modules focused and diffs small. Follow existing patterns before introducing new abstractions, unless doing so would violate the single-source-of-truth / One Definition Rule—then factor the shared abstraction instead of duplicating logic.
- UI code must keep parallel entry points in sync (e.g., toggles, badges, multi-edit). Shared helpers exist for a reason — extend them, don't fork them.

## Workflow Expectations

- Propose a brief plan before sizable changes and update it as work progresses.
- When a prompt is ambiguous, summarize your understanding and ask the user to confirm before proceeding.
- For code changes, always run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:unit` before handoff. Also run `npm run test:e2e:chromium` when the change touches flows covered by e2e specs. Fix regressions instead of punting them downstream. (`npm run release:win` gates automatically on `npm run test:all`; `npm run release:win-dev` skips tests for fast iteration.)
- Remove exploratory logs, diagnostics, and scaffolding once the fix is validated. If a commit is requested while any remain, pause and obtain explicit user confirmation before proceeding.
- Do not wait for confirmation when run without interactive UI, e.g. if run as commandline prompt in a script.
- Before committing, review earlier iterations and drop any obsolete changes that no longer apply after corrective prompts.
- Update docs when behavior, datasets, or workflows change. Add or edit entries in `docs/TECHNICAL.md` (and create new referenced files when needed) without waiting for an explicit user request.
- Treat the git history as immutable unless the user tells you otherwise. You **must not** stage, commit, amend, revert, or otherwise write to the repository unless the current prompt explicitly authorizes that exact action. A past "please commit" does **not** carry forward; if the user wants additional commits they will say so. When in doubt, ask—never assume permission. The lone exception is when you are dispatched by an orchestration script that sets the `CLAUDE_AUTOMATION` environment variable; those runs already include explicit commit instructions inside the plan, so you may follow the plan's commit/rename steps without asking the user again.
- Never imply that code edits or commits are expected unless the user has explicitly asked for them in the current prompt.
- Playwright runs may need elevated permissions to let Vite bind `127.0.0.1:5182`; rerun the shell command with `with_escalated_permissions: true` plus a one-line `justification` describing the port bind whenever the harness responds with `EPERM`.

## Safety & Data

- Align exports with the sample `.hsf` files under `docs/orig/`; do not guess at schema changes.
- SFC serialization format must remain backward-compatible. Never change a persisted field name or drop a field without a migration path that loads existing saved files correctly. Autosave is ephemeral session state and does not carry this requirement.
- Never silently discard user data. Unknown or unrecognized fields in SFC payloads should be preserved or explicitly warned about — not dropped without trace.
- Avoid destructive commands (mass deletes, force resets) unless the user explicitly requests them.
- Request elevated permissions before taking privileged filesystem or network actions.

Stay concise, keep users informed, and prefer incremental, well-tested changes.
