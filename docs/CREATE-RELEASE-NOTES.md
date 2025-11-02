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
| `TARGET_VERSION` | Release version without the leading `v` (for example `0.9.8`). |
| `RELEASE_COMMIT` | Commit hash that marks the release when catching up, or `HEAD` when refreshing the in-progress window. |
| `PREVIOUS_MARKER` | Hash of the previous release commit. Empty when building the very first entry. |
| `COMMIT_RANGE` | Git range to inspect (e.g. `148c35a..5eac81c`, or the standalone release hash when no prior marker exists). |
| `RELEASE_DATE` | ISO date (`yyyy-mm-dd`) that should appear next to the version heading. |
| `RELEASE_BRANCH` | Branch that the runner scanned (`origin/master`, `master`, etc.). |
| `PREVIOUS_VERSION` | Most recent released version prior to the current run (blank when none exist). |
| `PREVIOUS_DATE` | Release date paired with `PREVIOUS_VERSION` (blank when none exist). |
| `ENTRY_ALREADY_EXISTS` | `"true"` when `docs/HISTORY.txt` already contains `v<TARGET_VERSION>`, otherwise `"false"`. |
| `RELEASE_STATUS` | `new-entry`, `unreleased-extend`, or `released-verify` — use this to decide whether to append to the existing section or draft a new one. |

## Required Workflow
1. **Confirm Context**
   - Announce `TARGET_VERSION`, cite `RELEASE_STATUS`, and state whether you will extend an existing entry or draft a new one.
   - Re-read the baseline docs mentioned above, paying attention to how prior releases in `docs/HISTORY.txt` are worded and ordered.
   - Print the exact commands you will run before executing them so the maintainer can follow the trail.
   - Do not wait for human confirmation after outlining your plan; continue straight through the workflow. When you announce a command, execute it immediately with the `shell` tool (for example `{"command":["bash","-lc","cat AGENTS.md"]}`) and keep going unless the command fails.
2. **Audit the Commits**
   - Inspect `COMMIT_RANGE` with `git log --reverse --stat "$COMMIT_RANGE"` to get an overview.
   - For every commit that might matter to players, open the diff (`git show <hash>`) and understand what changed. Do not rely solely on commit messages.
   - Skip large binary diffs and sample exports under `examples/` unless they directly change product behaviour.
   - Build a detailed working list of user-facing outcomes: note every improvement, workflow change, localisation update, packaging tweak, or regression fix that players or release operators will feel. Treat each commit as a candidate; only merge notes when multiple commits clearly implement slices of the same feature.
3. **Draft the Notes**
   - Work in `docs/HISTORY.txt`.
   - Ensure entries stay ordered newest → oldest. Respect `RELEASE_STATUS`: when it is `unreleased-extend`, amend the existing `v${TARGET_VERSION}` section instead of adding a duplicate. Otherwise insert or refresh the heading as needed.
   - Use the following structure:

     ```markdown
     ## v<TARGET_VERSION> — <RELEASE_DATE>
     English:
     - Key update written for everyday players (ELI5 style is fine; use Raid Shadow Legends terms when helpful).
     - Another notable change. Stay specific—“bug fixes” alone is not acceptable.

     Deutsch:
     - Deutsche Zusammenfassung derselben Punkte in Alltagssprache.
     ```

   - Convert your working list into bullet points: each unique user-facing change should appear as its own bullet (or tightly related pair) so nothing slips through. Do not collapse unrelated improvements; include localisation and release-process changes when they affect the shipped experience. Break up long sentences instead of writing paragraphs.
   - Transliterate technical jargon into plain language the community understands. Instead of “cache invalidation” or “threaded worker”, write “preview updates faster now” or “app stays responsive during exports”. Mention technology terms only when they are meaningful to users (e.g., “added mock server script” for release operators).
   - Mention rollbacks or fixes only if they affect the final behaviour players will notice; ignore churn that no longer ships.
4. **Quality Check**
   - Re-read the English and German sections to ensure they cover the same points.
   - Confirm there are no easter-egg hints.
   - Keep whitespace tidy: blank line between the English and German blocks, and between releases.
   - Verify that every entry from your working list appears in both languages—if something is missing, add it.
5. **Report Back**
   - Summarise the changes you captured and highlight any areas that deserve manual verification.
   - If something prevented you from finishing the entry (e.g. conflicts, unclear commits), stop and report instead of guessing.

When the maintainer reruns the script, follow the same process and update the existing entry rather than duplicating it.
