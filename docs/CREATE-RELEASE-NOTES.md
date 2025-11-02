# Release Notes Prompt

Use this prompt when Codex must assemble or refresh the Sellfile Creator release history.

## Baseline Context
- Re-read `AGENTS.md`, `docs/TECHNICAL.md`, and the existing `docs/HISTORY.txt` entry list before investigating the commits.
- Keep the One Definition Rule in mind: reuse existing helpers and constants; do not fork logic when summarising behaviour.
- The authoritative release ledger lives at `docs/HISTORY.txt` (UTF-8 with BOM). Only that file should change during a release-notes run.

## Shared Ground Rules
- Never stage, commit, or amend Git history. The maintainer handles commits manually.
- Do not touch plan files or rename anything under `plans/`.
- Treat `examples/` as reference material. Skim those diffs only when they reveal user-facing behaviour; otherwise, you may omit the file-by-file commentary.
- Ignore hidden references to easter eggs. Do not mention them in the notes.
- Keep the tone factual and user-focused. Explain what players can now do or rely on; avoid hype or marketing fluff.
- If a feature was added and removed within the same release window, leave it out of the notes.

## Inputs Provided by the Runner
The orchestration script injects these environment variables for every Codex execution:

| Variable | Meaning |
| --- | --- |
| `RELEASE_NOTES_MODE` | Either `catchup` (past release) or `prepare` (upcoming release). |
| `TARGET_VERSION` | Release version without the leading `v` (for example `0.9.8`). |
| `RELEASE_COMMIT` | Commit hash that marks the release when catching up, or `HEAD` during preparation. |
| `PREVIOUS_MARKER` | Hash of the previous release commit. Empty when building the very first entry. |
| `COMMIT_RANGE` | Git range to inspect (e.g. `148c35a..5eac81c`, or the standalone release hash when no prior marker exists). |
| `RELEASE_DATE` | ISO date (`yyyy-mm-dd`) that should appear next to the version heading. |
| `RELEASE_BRANCH` | Branch that the runner scanned (`origin/master`, `master`, etc.). |

## Required Workflow
1. **Confirm Context**
   - Announce the mode (`catchup` or `prepare`) and `TARGET_VERSION`.
   - Re-read the baseline docs mentioned above, paying attention to how prior releases in `docs/HISTORY.txt` are worded and ordered.
   - Print the exact commands you will run before executing them so the maintainer can follow the trail.
2. **Audit the Commits**
   - Inspect `COMMIT_RANGE` with `git log --reverse --stat "$COMMIT_RANGE"` to get an overview.
   - For every commit that might matter to players, open the diff (`git show <hash>`) and understand what changed. Do not rely solely on commit messages.
   - Skip large binary diffs and sample exports under `examples/` unless they directly change product behaviour.
   - Capture the high-level outcomes: new capabilities, UX adjustments, guardrails, bug fixes, or removed behaviours that users must know about.
3. **Draft the Notes**
   - Work in `docs/HISTORY.txt`.
   - Ensure entries stay ordered newest → oldest. Insert or update the section for `v${TARGET_VERSION}` accordingly.
   - Use the following structure:

     ```markdown
     ## v<TARGET_VERSION> — <RELEASE_DATE>
     English:
     - Key update written for everyday players (ELI5 style is fine; use Raid Shadow Legends terms when helpful).
     - Another notable change. Stay specific—“bug fixes” alone is not acceptable.

     Deutsch:
     - Deutsche Zusammenfassung derselben Punkte in Alltagssprache.
     ```

  - Use as many bullets as needed to cover every major player-visible change. If the release spans a long timeframe or large commits, capture the additional highlights too. Break up long sentences instead of writing paragraphs.
   - Mention rollbacks or fixes only if they affect the final behaviour players will notice; ignore churn that no longer ships.
4. **Quality Check**
   - Re-read the English and German sections to ensure they cover the same points.
   - Confirm there are no easter-egg hints.
   - Keep whitespace tidy: blank line between the English and German blocks, and between releases.
5. **Report Back**
   - Summarise the changes you captured and highlight any areas that deserve manual verification.
   - If something prevented you from finishing the entry (e.g. conflicts, unclear commits), stop and report instead of guessing.

When the maintainer reruns the script, follow the same process and update the existing entry rather than duplicating it.
