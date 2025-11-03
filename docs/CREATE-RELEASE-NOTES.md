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
| `RELEASE_COMMIT_RANGE_FULL` | Full commit span for the release window; long histories may be split across several runs. |
| `RELEASE_COMMIT_TOTAL` | Number of commits across the full span listed above. |
| `RELEASE_CHUNK_INDEX` / `RELEASE_CHUNK_COUNT` | Present when the span is chunked; indicates which slice you are handling (1-based) and how many slices exist. |
| `RELEASE_CHUNK_COMMIT_COUNT` | Number of commits in the current chunk. |
| `RELEASE_CHUNK_PREVIOUS_COMMIT` | Last commit processed before this chunk (blank when there is no earlier slice). |
| `RELEASE_CHUNK_FIRST_COMMIT` / `RELEASE_CHUNK_LAST_COMMIT` | Oldest and newest commit hashes included in this run. |
| `PACKAGE_VERSION` | Raw version string from `package.json`; useful when confirming prerelease labels. |
| `PACKAGE_VERSION_IS_PRERELEASE` | `"true"` when `PACKAGE_VERSION` contains a prerelease suffix, otherwise `"false"`. |

## Required Workflow
1. **Confirm Context**
   - Announce `TARGET_VERSION`, cite `RELEASE_STATUS`, and state whether you will extend an existing entry or draft a new one.
   - When `RELEASE_CHUNK_COUNT` is present, note which chunk you are covering (`RELEASE_CHUNK_INDEX`) and skim the existing `v<TARGET_VERSION>` entry so you can build on the earlier slice instead of repeating it.
   - Re-read the baseline docs mentioned above, paying attention to how prior releases in `docs/HISTORY.txt` are worded and ordered.
   - Print the exact commands you will run before executing them so the maintainer can follow the trail. Immediately follow through by running those commands with shell tool calls in the same turn—especially `git log --reverse --stat "$COMMIT_RANGE"` plus the `git show` inspections. The automation flags runs that skip these commands and continues with a warning, so expect to double-check the generated notes when that happens.
   - Do not wait for human confirmation after outlining your plan; continue straight through the workflow.
2. **Audit the Commits**
   - Inspect `COMMIT_RANGE` with `git log --reverse --stat "$COMMIT_RANGE"` to get an overview. When the run is chunked, stay inside this range—future slices will handle the remaining commits.
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
   - Capture every change the player or release operator can experience. If the behaviour shifts in a visible way—UI, localisation, flows, exports—record it in the notes.
   - Transliterate technical jargon into plain language the community understands. Use Raid: Shadow Legends vocabulary freely, but avoid backend terms such as “cache”, “threads”, or “async” unless players interact with that concept directly. Prefer phrasing like “preview loads faster” over “cache warmed”.
   - Mention rollbacks or fixes only if they affect the final behaviour players will notice; ignore churn that no longer ships.
4. **Quality Check**
   - Re-read the English and German sections to ensure they cover the same points.
   - Confirm there are no easter-egg hints.
   - Keep whitespace tidy: blank line between the English and German blocks, and between releases.
   - Verify that every entry from your working list appears in both languages—if something is missing, add it.
5. **Report Back**
   - Summarise the changes you captured and highlight any areas that deserve manual verification.
   - If something prevented you from finishing the entry (e.g. conflicts, unclear commits), stop and report instead of guessing.
   - When additional chunks remain, call out any open threads the next run should resolve so the hand-off stays tight.

When the maintainer reruns the script, follow the same process and update the existing entry rather than duplicating it.
