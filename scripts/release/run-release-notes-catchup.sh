#!/usr/bin/env bash
set -euo pipefail

# Keep parsing strict to avoid accidental word-splitting.
IFS=$'\n\t'

# Resolve script + repo roots so paths are stable.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Anchor all work at the repo root.
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# Centralize doc paths so we only edit them here.
PROMPT_PATH="docs/CREATE-RELEASE-NOTES.md"
# The release ledger is always docs/HISTORY.txt.
HISTORY_PATH="docs/HISTORY.txt"

# Default to only the newest missing release entry.
process_all="false"

usage() {
  cat <<'EOF'
Usage: npm run release-notes:catchup [-- [--all]]

Options (pass after `--` when using npm):
  --all      Process every missing release entry instead of only the newest gap.
  -h, --help Show this help and exit.

Environment:
  RELEASE_NOTES_CATCHUP_ALL=1 has the same effect as --all.
EOF
}

# Parse CLI options explicitly for clarity.
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      process_all="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Allow environment override to force a full backfill.
if [[ "${RELEASE_NOTES_CATCHUP_ALL:-0}" == "1" ]]; then
  process_all="true"
fi

# Ensure required docs exist before we do any git work.
if [[ ! -f "$PROMPT_PATH" ]]; then
  echo "Release notes prompt missing at $PROMPT_PATH." >&2
  exit 1
fi
if [[ ! -f "$HISTORY_PATH" ]]; then
  echo "HISTORY.txt missing at $HISTORY_PATH. Create it before running the release-notes workflow." >&2
  exit 1
fi

# Configure chunk size for long release spans.
MAX_COMMITS_PER_CHUNK_DEFAULT=150
# Allow overrides for unusually large ranges.
MAX_COMMITS_PER_CHUNK="${RELEASE_NOTES_MAX_COMMITS_PER_CHUNK:-$MAX_COMMITS_PER_CHUNK_DEFAULT}"
if ! [[ "$MAX_COMMITS_PER_CHUNK" =~ ^[0-9]+$ ]] || [[ "$MAX_COMMITS_PER_CHUNK" -le 0 ]]; then
  echo "RELEASE_NOTES_MAX_COMMITS_PER_CHUNK must be a positive integer (received '$MAX_COMMITS_PER_CHUNK')." >&2
  exit 1
fi

# Track versions already in HISTORY.txt without bash 4 maps.
history_versions=()
# Capture the newest entry to detect in-progress behavior.
latest_history_version=""

parse_history_versions() {
  history_versions=()
  latest_history_version=""
  local line_number=0
  # Walk the history file line-by-line to keep parsing simple.
  while IFS= read -r raw_line; do
    line_number=$((line_number + 1))
    # Normalize CRLF to LF so regexes behave.
    local line="${raw_line//$'\r'/}"
    # Strip UTF-8 BOM if present on line 1.
    if [[ "$line_number" -eq 1 && "${line:0:1}" == $'\ufeff' ]]; then
      line="${line#?}"
    fi
    # Capture release headings in the canonical format.
    if [[ "$line" =~ ^##[[:space:]]+v([0-9]+\.[0-9]+\.[0-9]+) ]]; then
      local version="${BASH_REMATCH[1]}"
      history_versions+=("$version")
      # First heading is always the newest release.
      if [[ -z "$latest_history_version" ]]; then
        latest_history_version="$version"
      fi
    fi
  done <"$HISTORY_PATH"
}

version_in_history() {
  local version="$1"
  # Linear scan keeps this bash-3 compatible.
  for known in "${history_versions[@]}"; do
    if [[ "$known" == "$version" ]]; then
      return 0
    fi
  done
  return 1
}

diff_range() {
  local range="$1"
  # Single-commit ranges need ^! to avoid comparing with HEAD.
  if [[ "$range" == *".."* ]]; then
    printf '%s' "$range"
  else
    printf '%s^!' "$range"
  fi
}

ensure_history_entry() {
  local expected_version="$1"
  local require_entry="${2:-true}"
  if [[ "$require_entry" != "true" ]]; then
    return 0
  fi
  parse_history_versions
  if ! version_in_history "$expected_version"; then
    echo "Claude run finished, but docs/HISTORY.txt still lacks v${expected_version}." >&2
    echo "Review the output above and update the history entry manually if needed." >&2
    exit 1
  fi
}

select_branch() {
  local -a candidates=()
  # Allow explicit override first.
  if [[ -n "${RELEASE_NOTES_BRANCH:-}" ]]; then
    candidates+=("$RELEASE_NOTES_BRANCH")
  fi
  # Fall back to common branch names.
  candidates+=("origin/master" "master" "origin/main" "main" "HEAD")
  for candidate in "${candidates[@]}"; do
    # Use rev-parse to confirm the ref exists.
    if git rev-parse --verify --quiet "${candidate}^{commit}" >/dev/null; then
      echo "$candidate"
      return 0
    fi
  done
  # Fail loudly if no ref can be resolved.
  echo "Unable to resolve a branch to scan (checked: ${candidates[*]})." >&2
  return 1
}

collect_commit_chunks() {
  local commit_range="$1"
  local previous_marker="$2"

  # Capture the full commit list so we can slice it.
  commit_list=()
  while IFS= read -r commit; do
    commit_list+=("$commit")
  done < <(git rev-list --reverse "$commit_range")
  # Bail out early if the range is empty.
  if (( ${#commit_list[@]} == 0 )); then
    echo "No commits found in range ${commit_range}." >&2
    exit 1
  fi

  total_commit_count=${#commit_list[@]}
  chunk_total=$(( (total_commit_count + MAX_COMMITS_PER_CHUNK - 1) / MAX_COMMITS_PER_CHUNK ))

  chunk_ranges=()
  chunk_prev_commits=()
  chunk_first_commits=()
  chunk_last_commits=()
  chunk_commit_counts=()

  local previous_for_range="$previous_marker"
  for ((i = 0; i < chunk_total; i++)); do
    local start_index=$((i * MAX_COMMITS_PER_CHUNK))
    local end_index=$((start_index + MAX_COMMITS_PER_CHUNK - 1))
    # Clamp the end index for the final chunk.
    if (( end_index >= total_commit_count )); then
      end_index=$((total_commit_count - 1))
    fi

    local first_commit="${commit_list[$start_index]}"
    local last_commit="${commit_list[$end_index]}"
    local range_start="$previous_for_range"
    # Later chunks always use the commit immediately before them.
    if (( i > 0 )); then
      range_start="${commit_list[$((start_index - 1))]}"
    fi

    local range_spec
    if [[ -n "$range_start" ]]; then
      range_spec="${range_start}..${last_commit}"
    else
      range_spec="${last_commit}"
    fi

    chunk_ranges+=("$range_spec")
    chunk_prev_commits+=("$range_start")
    chunk_first_commits+=("$first_commit")
    chunk_last_commits+=("$last_commit")
    chunk_commit_counts+=("$((end_index - start_index + 1))")

    # Next chunk should start after this chunk's end.
    previous_for_range="$last_commit"
  done
}

run_claude_chunk() {
  # Identify which workflow we are running.
  local mode="$1"
  # Track the target release version for this run.
  local target_version="$2"
  # Capture the release commit pointer.
  local release_commit="$3"
  # Keep the previous marker for range context.
  local previous_release_marker="$4"
  # Record which branch we scanned.
  local branch="$5"
  # Use the provided release date for the heading.
  local release_date="$6"
  # Keep the full commit range for reporting.
  local commit_range_full="$7"
  # Track the full commit count for the release span.
  local total_commits="$8"
  # Identify which chunk we are on.
  local chunk_index="$9"
  # Track how many chunks exist in total.
  local chunk_total="${10}"
  # Use the chunk-specific commit range.
  local chunk_range="${11}"
  # Record the commit count for this chunk.
  local chunk_commit_count="${12}"
  # Capture the previous commit before the chunk.
  local chunk_prev_commit="${13}"
  # Record the first commit in the chunk.
  local chunk_first_commit="${14}"
  # Record the last commit in the chunk.
  local chunk_last_commit="${15}"
  # Decide whether to require a new history entry.
  local require_entry="${16}"
  # Pass the package version when in-progress.
  local pkg_version="${17:-}"
  # Track prerelease status for in-progress runs.
  local pkg_version_is_prerelease="${18:-}"
  # Note whether the entry already exists.
  local entry_exists="${19:-}"
  # Remember the previous version string.
  local previous_version="${20:-}"
  # Remember the previous release date.
  local previous_date="${21:-}"
  # Capture the release status code.
  local release_status="${22:-}"
  # Capture the human-readable status line.
  local release_status_human="${23:-}"

  # Provide concise summaries for the prompt body.
  local summary_log
  # Capture diff stats for the chunk.
  local diff_stat
  # Track top-level directories touched.
  local component_summary
  # Snapshot existing history for context.
  local history_snapshot
  # Load the shared prompt template.
  local prompt_body
  # Add extra context for in-progress runs.
  local extra_context=""

  # Summarize the commit list for this chunk.
  summary_log=$(git log --oneline --decorate=short --color=never "$chunk_range" || true)
  # Summarize changes without comparing against HEAD.
  diff_stat=$(git diff --stat "$(diff_range "$chunk_range")" || true)
  # Condense touched paths into a top-level list.
  component_summary=$(git diff --name-only "$(diff_range "$chunk_range")" | awk -F'/' 'NF {print $1}' | sort | uniq -c | sort -nr)
  # Capture the existing history for the prompt context.
  history_snapshot=$(cat "$HISTORY_PATH")
  # Load the shared release-notes prompt template.
  prompt_body=$(cat "$PROMPT_PATH")

  # Guard against empty summaries so the prompt stays readable.
  if [[ -z "$summary_log" ]]; then
    summary_log="<no commits returned by git log>"
  fi
  if [[ -z "$diff_stat" ]]; then
    diff_stat="<no diff>"
  fi
  if [[ -z "$component_summary" ]]; then
    component_summary="<none>"
  fi

  # Normalize empty previous commit labels.
  local chunk_prev_display="${chunk_prev_commit:-<none>}"

  # Include in-progress details only when relevant.
  if [[ "$mode" == "in-progress" ]]; then
    extra_context=$(
      cat <<EOF
- Current package version: ${pkg_version}
- Package build is prerelease: ${pkg_version_is_prerelease}
- Release status: ${release_status_human}
- History entry already exists: ${entry_exists}
- Previous release: v${previous_version:-n/a} (${previous_date:-n/a})
EOF
    )
  fi

  echo "Dispatching Claude for ${mode} v${target_version} chunk ${chunk_index}/${chunk_total} (range ${chunk_range})." >&2

  # Export all required inputs for the Claude prompt.
  # Core release identifiers.
  TARGET_VERSION="$target_version" \
  RELEASE_COMMIT="$release_commit" \
  PREVIOUS_MARKER="$previous_release_marker" \
  # Commit-range context for this run.
  COMMIT_RANGE="$chunk_range" \
  RELEASE_DATE="$release_date" \
  RELEASE_BRANCH="$branch" \
  # Chunk bookkeeping for multi-pass runs.
  RELEASE_CHUNK_INDEX="$chunk_index" \
  RELEASE_CHUNK_COUNT="$chunk_total" \
  RELEASE_CHUNK_COMMIT_COUNT="$chunk_commit_count" \
  # Chunk boundary commits for audit context.
  RELEASE_CHUNK_PREVIOUS_COMMIT="$chunk_prev_commit" \
  RELEASE_CHUNK_EXCLUDE_MARKER="$chunk_prev_commit" \
  RELEASE_CHUNK_FIRST_COMMIT="$chunk_first_commit" \
  RELEASE_CHUNK_LAST_COMMIT="$chunk_last_commit" \
  # Full-span totals for awareness.
  RELEASE_COMMIT_TOTAL="$total_commits" \
  RELEASE_COMMIT_RANGE_FULL="$commit_range_full" \
  # Package version flags for in-progress runs.
  PACKAGE_VERSION="$pkg_version" \
  PACKAGE_VERSION_IS_PRERELEASE="$pkg_version_is_prerelease" \
  # Existing entry hints for the prompt.
  ENTRY_ALREADY_EXISTS="$entry_exists" \
  PREVIOUS_VERSION="$previous_version" \
  PREVIOUS_DATE="$previous_date" \
  # Status flag used by the prompt instructions.
  RELEASE_STATUS="$release_status" \
  # Use the current HOME for Claude auth.
  HOME="${HOME:-}" \
  claude -p --dangerously-skip-permissions --add-dir "$REPO_ROOT" <<EOF
!! AUTOMATION NOTICE !!
- Immediately run: git log --reverse --stat "${chunk_range}"
- Open every player-facing commit you rely on with individual \`git show <hash>\` commands before writing notes.
- This is a non-interactive automation run; do not ask for confirmation. Proceed through the workflow immediately.
- If you would normally ask a question, state your assumption in one line and continue.

${prompt_body}

---
IMPORTANT: After outlining your plan, immediately execute the listed commands via tool calls in this run. Do not send another assistant message until you have run at least \`git log --reverse --stat "${chunk_range}"\` and inspected every relevant commit.
---
Existing release history (newest → oldest):
${history_snapshot}

---
Context for this run:
- Scope: ${mode} commit chunk ${chunk_index}/${chunk_total}
- Target version: v${target_version}
- Release commit: ${release_commit}
- Previous release marker: ${previous_release_marker:-<none>}
- Full release span: ${commit_range_full}
- Commit range for this chunk: ${chunk_range}
- Commits in this chunk: ${chunk_commit_count}/${total_commits}
- Previous chunk last commit: ${chunk_prev_display}
- First commit in chunk: ${chunk_first_commit}
- Last commit in chunk: ${chunk_last_commit}
- Release date: ${release_date}
- Branch scanned: ${branch}
${extra_context}

Quick commit summary (newest first):
${summary_log}

Changed files (git diff --stat):
${diff_stat}

Top-level directories touched:
${component_summary}
EOF

  # Fail fast if we expected a new entry and it is still missing.
  ensure_history_entry "$target_version" "$require_entry"
  echo "Completed Claude run for ${mode} v${target_version} chunk ${chunk_index}/${chunk_total}." >&2
}

parse_history_versions

# If the history is empty we must backfill everything.
if [[ -z "$latest_history_version" ]]; then
  process_all="true"
fi

# Resolve the branch we will scan for release commits.
BRANCH="$(select_branch)"
echo "Release history catch-up: scanning branch $BRANCH" >&2

# Collect release commits tagged with vX.Y.Z subjects.
release_lines=()
# Read the git log output into an array.
while IFS= read -r line; do
  release_lines+=("$line")
done < <(git log --format='%H|%cs|%s' --grep '^v[0-9]\+\.[0-9]\+\.[0-9]\+$' "$BRANCH")

# Reset release arrays before filling them.
release_commits=()
release_dates=()
release_versions=()

# Split each release log line into components.
for line in "${release_lines[@]}"; do
  IFS='|' read -r commit iso_date subject <<<"$line"
  # Strip the leading v from the subject.
  version="${subject#v}"
  release_commits+=("$commit")
  release_dates+=("$iso_date")
  release_versions+=("$version")
done

missing_indices=()
# Identify release commits that are absent from HISTORY.txt.
for idx in "${!release_versions[@]}"; do
  version="${release_versions[$idx]}"
  if ! version_in_history "$version"; then
    missing_indices+=("$idx")
  fi
done

if [[ "$process_all" != "true" && "${#missing_indices[@]}" -gt 1 ]]; then
  newest_idx=$(printf '%s\n' "${missing_indices[@]}" | sort -n | head -n 1)
  echo "Multiple release entries are missing; defaulting to the newest gap (v${release_versions[$newest_idx]}). Pass --all to backfill everything." >&2
  missing_indices=("$newest_idx")
fi

if [[ "${#missing_indices[@]}" -gt 0 ]]; then
  missing_indices_sorted=()
  # Sort missing entries from oldest to newest.
  while IFS= read -r line; do
    missing_indices_sorted+=("$line")
  done < <(printf '%s\n' "${missing_indices[@]}" | sort -nr)
  missing_indices=("${missing_indices_sorted[@]}")
fi

for idx in "${missing_indices[@]}"; do
  commit="${release_commits[$idx]}"
  version="${release_versions[$idx]}"
  iso_date="${release_dates[$idx]}"

  # Figure out the previous release marker for range building.
  previous_commit=""
  if [[ $idx -lt $((${#release_commits[@]} - 1)) ]]; then
    previous_commit="${release_commits[$((idx + 1))]}"
  fi

  # Build the commit range for this release span.
  if [[ -n "$previous_commit" ]]; then
    commit_range="${previous_commit}..${commit}"
  else
    commit_range="${commit}"
  fi

  chunk_ranges=()
  chunk_prev_commits=()
  chunk_first_commits=()
  chunk_last_commits=()
  chunk_commit_counts=()
  total_commit_count=0
  chunk_total=0

  # Split the release span into manageable chunks.
  collect_commit_chunks "$commit_range" "$previous_commit"

  if (( chunk_total > 1 )); then
    echo "Commit range ${commit_range} spans ${total_commit_count} commits; splitting into ${chunk_total} chunks (max ${MAX_COMMITS_PER_CHUNK} per run)." >&2
  fi

  for chunk_idx in "${!chunk_ranges[@]}"; do
    chunk_range_spec="${chunk_ranges[$chunk_idx]}"
    chunk_commit_count="${chunk_commit_counts[$chunk_idx]}"
    chunk_prev_commit="${chunk_prev_commits[$chunk_idx]}"
    chunk_first_commit="${chunk_first_commits[$chunk_idx]}"
    chunk_last_commit="${chunk_last_commits[$chunk_idx]}"
    chunk_number=$((chunk_idx + 1))
    require_entry="false"
    if [[ "$chunk_idx" -eq 0 ]]; then
      require_entry="true"
    fi
    # Dispatch the Claude run for this released chunk.
    run_claude_chunk \
      "released" \
      "$version" \
      "$commit" \
      "$previous_commit" \
      "$BRANCH" \
      "$iso_date" \
      "$commit_range" \
      "$total_commit_count" \
      "$chunk_number" \
      "$chunk_total" \
      "$chunk_range_spec" \
      "$chunk_commit_count" \
      "$chunk_prev_commit" \
      "$chunk_first_commit" \
      "$chunk_last_commit" \
      "$require_entry"
  done
done

# Refresh history after catch-up before checking in-progress notes.
parse_history_versions

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to inspect package.json." >&2
  exit 1
fi

# Read the version from package.json.
pkg_version="$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")"
if [[ -z "$pkg_version" ]]; then
  echo "Unable to read version from package.json." >&2
  exit 1
fi

target_version="${pkg_version%%-*}"
if [[ -z "$target_version" ]]; then
  echo "Failed to derive release version from package.json version '$pkg_version'." >&2
  exit 1
fi

# Detect prerelease versions for in-progress updates.
pkg_version_is_prerelease="false"
if [[ "$pkg_version" == *-* ]]; then
  pkg_version_is_prerelease="true"
fi

# If the version already has a release commit, skip in-progress.
release_index=""
# Locate a release commit with the same version.
for idx in "${!release_versions[@]}"; do
  if [[ "${release_versions[$idx]}" == "$target_version" ]]; then
    release_index="$idx"
    break
  fi
done

if [[ -n "$release_index" ]]; then
  echo "Latest package version (v${target_version}) already has a release commit; no in-progress notes to update." >&2
else
  previous_commit=""
  previous_version=""
  previous_date=""
  # Capture the most recent release for range building.
  if [[ "${#release_commits[@]}" -gt 0 ]]; then
    previous_commit="${release_commits[0]}"
    previous_version="${release_versions[0]}"
    previous_date="${release_dates[0]}"
  fi

  # Build the in-progress range from last release to HEAD.
  if [[ -n "$previous_commit" ]]; then
    commit_range="${previous_commit}..HEAD"
  else
    commit_range="HEAD"
  fi

  # Count commits to avoid empty in-progress runs.
  commit_count=$(git rev-list --count "$commit_range")
  if [[ "$commit_count" -eq 0 ]]; then
    echo "No commits found between the last release and HEAD; skipping in-progress notes update." >&2
  else
    entry_exists="false"
    # Detect whether the entry already exists.
    if version_in_history "$target_version"; then
      entry_exists="true"
    fi

    # Use explicit release date override when provided.
    release_date="${RELEASE_NOTES_DATE:-$(date +%F)}"
    release_branch_current="$(git rev-parse --abbrev-ref HEAD)"
    release_commit_head="$(git rev-parse HEAD)"

    # Pick a status label for the prompt context.
    release_status="new-entry"
    release_status_human="New version (create entry)"
    if [[ "$entry_exists" == "true" ]]; then
      if [[ "$pkg_version_is_prerelease" == "true" && "$target_version" == "$latest_history_version" ]]; then
        release_status="unreleased-extend"
        release_status_human="Unreleased (extend existing entry; safe to revise)"
      else
        release_status="released-verify"
        release_status_human="Released version already recorded; verify only"
      fi
    fi

    chunk_ranges=()
    chunk_prev_commits=()
    chunk_first_commits=()
    chunk_last_commits=()
    chunk_commit_counts=()
    total_commit_count=0
    chunk_total=0

    # Split the in-progress span into manageable chunks.
    collect_commit_chunks "$commit_range" "$previous_commit"

    if (( chunk_total > 1 )); then
      echo "In-progress range ${commit_range} spans ${total_commit_count} commits; splitting into ${chunk_total} chunks (max ${MAX_COMMITS_PER_CHUNK} per run)." >&2
    fi

    for chunk_idx in "${!chunk_ranges[@]}"; do
      chunk_range_spec="${chunk_ranges[$chunk_idx]}"
      chunk_commit_count="${chunk_commit_counts[$chunk_idx]}"
      chunk_prev_commit="${chunk_prev_commits[$chunk_idx]}"
      chunk_first_commit="${chunk_first_commits[$chunk_idx]}"
      chunk_last_commit="${chunk_last_commits[$chunk_idx]}"
      chunk_number=$((chunk_idx + 1))
      require_entry="false"
      if [[ "$entry_exists" != "true" && "$chunk_idx" -eq 0 ]]; then
        require_entry="true"
      fi
      # Dispatch the Claude run for this in-progress chunk.
      run_claude_chunk \
        "in-progress" \
        "$target_version" \
        "$release_commit_head" \
        "$previous_commit" \
        "$release_branch_current" \
        "$release_date" \
        "$commit_range" \
        "$total_commit_count" \
        "$chunk_number" \
        "$chunk_total" \
        "$chunk_range_spec" \
        "$chunk_commit_count" \
        "$chunk_prev_commit" \
        "$chunk_first_commit" \
        "$chunk_last_commit" \
        "$require_entry" \
        "$pkg_version" \
        "$pkg_version_is_prerelease" \
        "$entry_exists" \
        "$previous_version" \
        "$previous_date" \
        "$release_status" \
        "$release_status_human"

      if version_in_history "$target_version"; then
        entry_exists="true"
      fi
    done
  fi
fi

echo "Release-notes Claude workflow finished. Review docs/HISTORY.txt for the latest entries." >&2
