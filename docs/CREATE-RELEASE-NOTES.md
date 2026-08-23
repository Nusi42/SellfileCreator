# Release Notes Prompt

Update `userDocs/HISTORY.md` with the entry for `v$TARGET_VERSION`. This is a non-interactive automation run; do not ask for confirmation. If something is ambiguous, state your assumption in one line and proceed.

The script that invokes you is `scripts/release/run-release-notes-catchup.sh` (or its PowerShell twin `run-release-notes-catchup.ps1` on Windows — the two are equivalent). It calls you in one of two modes:
- **Single-pass** — one Claude run handles a release whose changed-line total fits the budget. `BULLETS_DIR` is empty; you read commits directly.
- **Reducer** — workers have already distilled the commits into bullet files. `BULLETS_DIR` points at them; you skip git and consolidate.

## Inputs (env vars)

| Variable | Meaning |
| --- | --- |
| `TARGET_VERSION` | Version without leading `v` (e.g. `0.9.8`). |
| `RELEASE_DATE` | ISO date for the heading (`yyyy-mm-dd`). |
| `COMMIT_RANGE` | Git range or single hash to inspect. |
| `RELEASE_STATUS` | `new-entry` (insert a fresh section), `unreleased-extend` (amend the existing `v$TARGET_VERSION` block), or `released-verify` (review only — change nothing unless inaccurate). |
| `BULLETS_DIR` | Empty in single-pass mode. In reducer mode, the directory holding `chunk-*.bullets.md` files. |
| `CHECKLIST_FILE` | Empty in reducer mode (workers already populated it). In single-pass, the file you APPEND maintainer-facing review items to. |

The script also prints a "Context for this run" block with the current values so you do not need `printenv` for the common ones.

If an **"Additional instruction from the maintainer for this run"** section follows the context block, treat it as steering for this run only — emphasis, ordering, length, or which changes matter most. It never overrides the rules below: no easter eggs, no developer-only features, plain language, and the bilingual structure still apply.

## Workflow

### 1. Re-read baseline docs
- `CLAUDE.md` and the top of `userDocs/HISTORY.md` so your tone, structure, and ordering match prior releases.

### 2. Gather the changes
- **Single-pass mode** (`BULLETS_DIR` empty): run `git log --reverse --stat "$COMMIT_RANGE"` to get the overview, then `git show <hash>` on every commit that might affect what players or release operators experience. Treat commit messages as introductory — open the diff. Some commits run thousands of lines; budget your reading. Skip large binary diffs and `examples/` unless they directly change shipping behavior.
- **Reducer mode** (`BULLETS_DIR` set): read every `*.bullets.md` file in that directory. Each bullet ends with a short hash in parens for dedupe. Do not re-run `git show` — workers already inspected those commits. Only fall back to git if a bullet is too vague to convert into a player-facing note.

### 3. Compose the entry in `userDocs/HISTORY.md`

The file is UTF-8 with BOM, ordered newest → oldest. Honor `RELEASE_STATUS`:
- `new-entry`: insert a new section at the top (under any existing file header).
- `unreleased-extend`: amend the existing `v$TARGET_VERSION` block — add new bullets, revise wording, do not duplicate the heading.
- `released-verify`: read the existing entry against the commit history. Only edit if you find a factual error; otherwise leave it alone and say so in the report.

Section structure:

```markdown
## v$TARGET_VERSION — $RELEASE_DATE
English:
- Concrete player-facing change in plain language. Raid: Shadow Legends terms welcome.
- Another distinct change. "Bug fixes" alone is never acceptable — name the fix.

Deutsch:
- Gleiche Punkte auf Deutsch, in Alltagssprache.
- Weitere Änderung.
```

### 4. Append maintainer items to `$CHECKLIST_FILE` (single-pass only; skip if empty)

A checklist item is a **concrete action the maintainer still has to take** — not a reminder to look at something that already shipped. The default is to add **nothing**. Before flagging anything, confirm a later commit in the range hasn't already resolved it. Bullets only; no headings — the script wraps them in a per-version section afterward.

Add an item ONLY when it is actionable and still open, e.g.:
- Unfinished cleanup gated on a condition ("remove `FEATURE_X_FALLBACK` once Helper sends Affinity").
- A migration or persisted-data shape change you could **not** confirm is backward-compatible from the diff (per CLAUDE.md, persisted field changes need migration paths).
- A regression you genuinely suspect but cannot confirm from the diff — say why.
- Tests skipped/`xfail`'d in the window with no removal date.
- Docs that drifted out of sync with the change (especially `docs/TECHNICAL.md` and `CLAUDE.md`).

Do NOT add:
- "Verify `<feature>` works" notes for changes that shipped with passing unit/e2e tests.
- Restatements that tests, fixtures, or all i18n locales were updated when the diff already shows they were.
- "No follow-up needed" notes — if there is no action, write nothing.
- Generic "test across browsers / languages / viewports" reminders without a specific, identified risk.

Each item must name the action and its trigger/condition. When in doubt, leave it out — an empty checklist is the expected, healthy outcome.

If you find no concerns, leave `$CHECKLIST_FILE` untouched.

## Rules

- **Never** stage, commit, or amend git. The maintainer handles commits.
- Do not touch anything under `plans/` or rename plan files.
- Treat `examples/` diffs as reference material; skim only when behavior changes.
- Keep tone factual and player-focused. No hype, no marketing fluff. **Plain language first** — backend terms (cache, threads, async, mutex, invalidat*, race condition) are banned unless the player literally interacts with that concept. A "caching problem" is acceptable when it genuinely explains the symptom; internal implementation details are not.
- **Bug fixes: frame as happy little accidents.** A bug that slipped in while making the app better should be presented sympathetically — not as a failure, but as a side-effect of ambitious improvements. Never describe a bug in stark technical terms; describe the symptom the player experienced and, if context helps, briefly note the optimization that unintentionally caused it (in plain language).
- **Only mention changes that meaningfully affect players.** Skip minor UI polish, cosmetic tweaks, and internal-only improvements unless there are no other changes for the release — in that case they may be included. If in doubt, leave it out.
- **Do not mention developer/creator-native features in the history.** Note DSL syntax (e.g. `setval`, `unit=`, `needs=`, `toggleside`), editor syntax highlighting, inline diagnostics for malformed override configs, and similar authoring tools are internal features; omit them from HISTORY.md entirely. Only mention what players who *use* a note (not those who *write* one) will notice.
- **Be aware of what is new vs. already released.** Before writing a bullet, check whether the feature or behavior it describes already existed in a previous release entry. Fixes and extensions for things that were not yet shipped belong to the same release window and should be dropped. Do not write "Fixed: …" for a bug that was introduced *and* fixed within the same window — it never affected users.
- Drop features added and removed within the same release window.
- Drop fixes for features added in the same release window.
- Do not mention or hint at easter eggs.
- One bullet per distinct change. Do not collapse unrelated improvements into a single line. Break long sentences instead of writing paragraphs.
- Honor One Definition Rule and other CLAUDE.md guidelines if you ever need to edit code-adjacent files (you usually do not — this run only touches `userDocs/HISTORY.md` and the checklist).

## Quality check before reporting back

- English and German bullets cover the same points, in roughly the same order.
- No easter-egg hints leaked through.
- Blank line between the English and German blocks, and between releases.
- The entry is the newest section in the file (or the amended one, for `unreleased-extend`).

## Report

In your final message, summarize:
- Which bullets you wrote (one line each is fine).
- Anything you flagged in the checklist.
- Anything that needs manual verification (commits you could not interpret, tone calls you were unsure about).

When the maintainer reruns the script, follow the same process and update the existing entry rather than duplicating it.
