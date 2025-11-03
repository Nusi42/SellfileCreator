#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PROMPT_PATH="docs/CREATE-RELEASE-NOTES.md"
HISTORY_PATH="docs/HISTORY.txt"

ORIGINAL_HOME="${HOME:-}"
if [[ -z "$ORIGINAL_HOME" ]]; then
  echo "HOME environment variable is not set; Codex authentication cannot be located." >&2
  exit 1
fi

CODEX_RUNTIME_ROOT="$SCRIPT_DIR/.tmp/release-notes-codex-home"
CODEX_RUNTIME_HOME="$CODEX_RUNTIME_ROOT/home"
CODEX_RUNTIME_DOTCODEX="$CODEX_RUNTIME_HOME/.codex"

prepare_codex_runtime_home() {
  rm -rf "$CODEX_RUNTIME_ROOT"
  mkdir -p "$CODEX_RUNTIME_DOTCODEX/log" "$CODEX_RUNTIME_DOTCODEX/sessions"

  local source_dir="$ORIGINAL_HOME/.codex"
  local required_auth="$source_dir/auth.json"
  if [[ ! -f "$required_auth" ]]; then
    echo "Codex credentials missing at $required_auth. Run 'codex login' and rerun the release-notes workflow." >&2
    exit 1
  fi
  cp "$required_auth" "$CODEX_RUNTIME_DOTCODEX/auth.json"

  for optional_file in config.toml internal_storage.json version.json; do
    if [[ -f "$source_dir/$optional_file" ]]; then
      cp "$source_dir/$optional_file" "$CODEX_RUNTIME_DOTCODEX/$optional_file"
    fi
  done
}

latest_codex_session_file() {
  local sessions_root="$CODEX_RUNTIME_HOME/.codex/sessions"
  if [[ ! -d "$sessions_root" ]]; then
    return 1
  fi
  find "$sessions_root" -type f -name '*.jsonl' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2-
}

verify_codex_session_activity() {
  local previous_session_path="${1:-}"
  local description="${2:-codex run}"
  local required_snippet="${3:-}"
  local latest_session_path
  latest_session_path="$(latest_codex_session_file || true)"
  if [[ -z "$latest_session_path" ]]; then
    echo "Codex run for ${description} finished without producing a session log." >&2
    return 2
  fi
  if [[ -n "$previous_session_path" && "$previous_session_path" == "$latest_session_path" ]]; then
    echo "Codex run for ${description} did not create a new session log (still ${latest_session_path})." >&2
    echo "Investigate the prompt/output above and rerun after ensuring Codex executed commands." >&2
    return 2
  fi
  local status=0
  if ! grep -q '"type":"tool_result"' "$latest_session_path"; then
    echo "Codex run for ${description} completed but the session log (${latest_session_path}) shows no tool executions." >&2
    echo "Codex likely stopped before running any commands; rerun or review the generated notes manually." >&2
    status=1
  fi
  if ! grep -q '"tool_name":"shell"' "$latest_session_path"; then
    echo "Codex run for ${description} executed no shell commands (session ${latest_session_path})." >&2
    echo "Ensure the agent inspects the repository before drafting notes; continuing with a warning." >&2
    status=1
  fi
  if [[ -n "$required_snippet" ]]; then
    if ! grep -Fq "$required_snippet" "$latest_session_path"; then
      echo "Codex run for ${description} did not execute the required command snippet (${required_snippet}) in session ${latest_session_path}." >&2
      echo "The workflow expects that command to run before drafting notes; continuing with a warning." >&2
      status=1
    fi
  fi
  return "$status"
}

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

process_all="false"

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

if [[ "${RELEASE_NOTES_CATCHUP_ALL:-0}" == "1" ]]; then
  process_all="true"
fi

if [[ ! -f "$PROMPT_PATH" ]]; then
  echo "Release notes prompt missing at $PROMPT_PATH." >&2
  exit 1
fi

if [[ ! -f "$HISTORY_PATH" ]]; then
  echo "HISTORY.txt missing at $HISTORY_PATH. Create it before running the release-notes workflow." >&2
  exit 1
fi

MAX_COMMITS_PER_CHUNK_DEFAULT=150
MAX_COMMITS_PER_CHUNK="${RELEASE_NOTES_MAX_COMMITS_PER_CHUNK:-$MAX_COMMITS_PER_CHUNK_DEFAULT}"
if ! [[ "$MAX_COMMITS_PER_CHUNK" =~ ^[0-9]+$ ]] || [[ "$MAX_COMMITS_PER_CHUNK" -le 0 ]]; then
  echo "RELEASE_NOTES_MAX_COMMITS_PER_CHUNK must be a positive integer (received '$MAX_COMMITS_PER_CHUNK')." >&2
  exit 1
fi

declare -A history_versions=()
latest_history_version=""

parse_history() {
  history_versions=()
  latest_history_version=""
  line_number=0
  while IFS= read -r raw_line; do
    line_number=$((line_number + 1))
    line="${raw_line//$'\r'/}"
    if [[ "$line_number" -eq 1 && "${line:0:1}" == $'\ufeff' ]]; then
      line="${line#?}"
    fi
    if [[ "$line" =~ ^##[[:space:]]+v([0-9]+\.[0-9]+\.[0-9]+) ]]; then
      version="${BASH_REMATCH[1]}"
      history_versions["$version"]=1
      if [[ -z "$latest_history_version" ]]; then
        latest_history_version="$version"
      fi
    fi
  done <"$HISTORY_PATH"
}

parse_history

capture_history_entry() {
  local version="$1"
  awk -v ver="$version" '
    BEGIN { in_section = 0 }
    /^##[[:space:]]+v[0-9]+\.[0-9]+\.[0-9]+/ {
      if (in_section) {
        exit
      }
      if ($0 ~ "^##[[:space:]]+v" ver) {
        in_section = 1
        print
        next
      }
    }
    {
      if (in_section) {
        print
      }
    }
  ' "$HISTORY_PATH"
}

ensure_history_entry() {
  local expected_version="$1"
  local previous_snapshot="${2:-}"
  local require_change="${3:-1}"
  parse_history
  if [[ -z "${history_versions[$expected_version]:-}" ]]; then
    echo "Codex run completed, but docs/HISTORY.txt still lacks v${expected_version}." >&2
    echo "Review the output above, resolve any issues, and rerun the release-notes workflow." >&2
    exit 1
  fi
  if [[ "$require_change" == "1" || "$require_change" == "true" ]]; then
    if [[ -n "$previous_snapshot" ]]; then
      local current_snapshot
      current_snapshot="$(capture_history_entry "$expected_version")"
      if [[ "$current_snapshot" == "$previous_snapshot" ]]; then
        echo "Codex finished, but the v${expected_version} entry is unchanged." >&2
        echo "Re-run the workflow or update docs/HISTORY.txt manually if updates are still required." >&2
        exit 1
      fi
    fi
  fi
}

collect_commit_chunks() {
  local commit_range="$1"
  local previous_marker="$2"
  local total_count_name="$3"
  local chunk_total_name="$4"
  local ranges_name="$5"
  local exclude_name="$6"
  local prev_commits_name="$7"
  local firsts_name="$8"
  local lasts_name="$9"
  local counts_name="${10}"

  declare -n total_count_ref="$total_count_name"
  declare -n chunk_total_ref="$chunk_total_name"
  declare -n ranges_ref="$ranges_name"
  declare -n exclude_ref="$exclude_name"
  declare -n prev_commits_ref="$prev_commits_name"
  declare -n firsts_ref="$firsts_name"
  declare -n lasts_ref="$lasts_name"
  declare -n counts_ref="$counts_name"

  mapfile -t commit_list < <(git rev-list --reverse "$commit_range")
  if (( ${#commit_list[@]} == 0 )); then
    echo "No commits found in range ${commit_range}." >&2
    exit 1
  fi

  total_count_ref=${#commit_list[@]}
  chunk_total_ref=$(( (total_count_ref + MAX_COMMITS_PER_CHUNK - 1) / MAX_COMMITS_PER_CHUNK ))

  ranges_ref=()
  exclude_ref=()
  prev_commits_ref=()
  firsts_ref=()
  lasts_ref=()
  counts_ref=()

  local prev_marker_for_chunk="$previous_marker"
  for ((i = 0; i < chunk_total_ref; i++)); do
    local start_index=$((i * MAX_COMMITS_PER_CHUNK))
    local end_index=$((start_index + MAX_COMMITS_PER_CHUNK - 1))
    if (( end_index >= total_count_ref )); then
      end_index=$((total_count_ref - 1))
    fi

    local first_commit="${commit_list[$start_index]}"
    local last_commit="${commit_list[$end_index]}"
    local previous_commit_display="$prev_marker_for_chunk"
    if (( i > 0 )); then
      previous_commit_display="${commit_list[$((start_index - 1))]}"
    fi

    local exclude_marker="$prev_marker_for_chunk"
    if [[ -z "$exclude_marker" ]]; then
      if git rev-parse --verify "${first_commit}^" >/dev/null 2>&1; then
        exclude_marker="$(git rev-parse "${first_commit}^")"
      else
        exclude_marker=""
      fi
    fi

    local chunk_range_spec
    if [[ -n "$exclude_marker" ]]; then
      chunk_range_spec="${exclude_marker}..${last_commit}"
    else
      chunk_range_spec="${last_commit}"
    fi

    local chunk_commit_count=$((end_index - start_index + 1))

    ranges_ref+=("$chunk_range_spec")
    exclude_ref+=("$exclude_marker")
    prev_commits_ref+=("$previous_commit_display")
    firsts_ref+=("$first_commit")
    lasts_ref+=("$last_commit")
    counts_ref+=("$chunk_commit_count")

    prev_marker_for_chunk="$last_commit"
  done
}

run_released_codex_chunk() {
  local version="$1"
  local release_commit="$2"
  local previous_release_marker="$3"
  local branch="$4"
  local release_date="$5"
  local commit_range_full="$6"
  local total_commit_count="$7"
  local chunk_index="$8"
  local chunk_total="$9"
  local chunk_range="${10}"
  local chunk_commit_count="${11}"
  local chunk_prev_commit="${12}"
  local chunk_exclude_marker="${13}"
  local chunk_first_commit="${14}"
  local chunk_last_commit="${15}"
  local require_change="${16:-1}"

  local summary_log
  local diff_stat
  local component_summary
  local history_snapshot
  local prompt_body
  local entry_before

  summary_log=$(git log --oneline --decorate=short --color=never "$chunk_range" || true)
  diff_stat=$(git diff --stat "$chunk_range" || true)
  component_summary=$(git diff --name-only "$chunk_range" | awk -F'/' 'NF {print $1}' | sort | uniq -c | sort -nr)
  history_snapshot=$(cat "$HISTORY_PATH")
  prompt_body=$(cat "$PROMPT_PATH")
  entry_before="$(capture_history_entry "$version")"

  if [[ -z "$summary_log" ]]; then
    summary_log="<no commits returned by git log>"
  fi
  if [[ -z "$diff_stat" ]]; then
    diff_stat="<no diff>"
  fi
  if [[ -z "$component_summary" ]]; then
    component_summary="<none>"
  fi

  local chunk_prev_commit_display="${chunk_prev_commit:-<none>}"
  local chunk_exclude_display="${chunk_exclude_marker:-<none>}"

  echo "Dispatching Codex for released v${version} chunk ${chunk_index}/${chunk_total} (range ${chunk_range})." >&2

  prepare_codex_runtime_home
  local previous_session_path
  previous_session_path="$(latest_codex_session_file || true)"
  TARGET_VERSION="$version" \
  RELEASE_COMMIT="$release_commit" \
  PREVIOUS_MARKER="$previous_release_marker" \
  COMMIT_RANGE="$chunk_range" \
  RELEASE_DATE="$release_date" \
  RELEASE_BRANCH="$branch" \
  RELEASE_CHUNK_INDEX="$chunk_index" \
  RELEASE_CHUNK_COUNT="$chunk_total" \
  RELEASE_CHUNK_COMMIT_COUNT="$chunk_commit_count" \
  RELEASE_CHUNK_PREVIOUS_COMMIT="$chunk_prev_commit" \
  RELEASE_CHUNK_EXCLUDE_MARKER="$chunk_exclude_marker" \
  RELEASE_CHUNK_FIRST_COMMIT="$chunk_first_commit" \
  RELEASE_CHUNK_LAST_COMMIT="$chunk_last_commit" \
  RELEASE_COMMIT_TOTAL="$total_commit_count" \
  RELEASE_COMMIT_RANGE_FULL="$commit_range_full" \
  HOME="$CODEX_RUNTIME_HOME" \
  codex exec --sandbox workspace-write --cd "$REPO_ROOT" -- <<EOF
!! AUTOMATION NOTICE !!
- Immediately execute the shell command \`{"command":["bash","-lc","git log --reverse --stat \\"${chunk_range}\\""]}\`.
- Open every player-facing commit you rely on with individual \`git show <hash>\` commands (e.g. \`{"command":["bash","-lc","git show 1234abcd"]}\`) before writing notes.
- The workflow aborts when these commands are skipped—run them now, then proceed with the steps below.

${prompt_body}

---
IMPORTANT: After outlining your plan, immediately execute the listed commands via tool calls in this run. Do not send another assistant message until you have run at least \`git log --reverse --stat "${chunk_range}"\` and inspected every relevant commit; the workflow aborts when no tools are used.
---
Existing release history (newest → oldest):
${history_snapshot}

---
Context for this run:
- Scope: released commit chunk ${chunk_index}/${chunk_total}
- Target version: v${version}
- Release commit: ${release_commit}
- Previous release marker: ${previous_release_marker:-<none>}
- Full release span: ${commit_range_full}
- Commit range for this chunk: ${chunk_range}
- Commits in this chunk: ${chunk_commit_count}/${total_commit_count}
- Previous chunk last commit: ${chunk_prev_commit_display}
- Range exclude marker used for git diff/log: ${chunk_exclude_display}
- First commit in chunk: ${chunk_first_commit}
- Last commit in chunk: ${chunk_last_commit}
- Release date: ${release_date}
- Branch scanned: ${branch}

Quick commit summary (newest first):
${summary_log}

Changed files (git diff --stat):
${diff_stat}

  Top-level directories touched:
${component_summary}
EOF

  if ! verify_codex_session_activity "$previous_session_path" "released v${version} chunk ${chunk_index}/${chunk_total}" "git log --reverse --stat"; then
    echo "Warning: released chunk ${chunk_index}/${chunk_total} relied on pre-supplied context; double-check docs/HISTORY.txt manually." >&2
  fi
  ensure_history_entry "$version" "$entry_before" "$require_change"
  echo "Completed Codex run for released v${version} chunk ${chunk_index}/${chunk_total}." >&2
}

run_inprogress_codex_chunk() {
  local pkg_version="$1"
  local target_version="$2"
  local release_commit="$3"
  local previous_release_marker="$4"
  local branch="$5"
  local release_date="$6"
  local release_status="$7"
  local release_status_human="$8"
  local entry_exists="$9"
  local previous_version="${10}"
  local previous_date="${11}"
  local commit_range_full="${12}"
  local total_commit_count="${13}"
  local chunk_index="${14}"
  local chunk_total="${15}"
  local chunk_range="${16}"
  local chunk_commit_count="${17}"
  local chunk_prev_commit="${18}"
  local chunk_exclude_marker="${19}"
  local chunk_first_commit="${20}"
  local chunk_last_commit="${21}"
  local pkg_version_is_prerelease="${22}"
  local require_change="${23:-1}"

  local summary_log
  local diff_stat
  local component_summary
  local history_snapshot
  local prompt_body
  local entry_before

  summary_log=$(git log --oneline --decorate=short --color=never "$chunk_range" || true)
  diff_stat=$(git diff --stat "$chunk_range" || true)
  component_summary=$(git diff --name-only "$chunk_range" | awk -F'/' 'NF {print $1}' | sort | uniq -c | sort -nr)
  history_snapshot=$(cat "$HISTORY_PATH")
  prompt_body=$(cat "$PROMPT_PATH")
  entry_before="$(capture_history_entry "$target_version")"

  if [[ -z "$summary_log" ]]; then
    summary_log="<no commits returned by git log>"
  fi
  if [[ -z "$diff_stat" ]]; then
    diff_stat="<no diff>"
  fi
  if [[ -z "$component_summary" ]]; then
    component_summary="<none>"
  fi

  local chunk_prev_commit_display="${chunk_prev_commit:-<none>}"
  local chunk_exclude_display="${chunk_exclude_marker:-<none>}"

  echo "Dispatching Codex for in-progress v${target_version} chunk ${chunk_index}/${chunk_total} (range ${chunk_range})." >&2

  prepare_codex_runtime_home
  local previous_session_path
  previous_session_path="$(latest_codex_session_file || true)"
  TARGET_VERSION="$target_version" \
  RELEASE_COMMIT="$release_commit" \
  PREVIOUS_MARKER="$previous_release_marker" \
  COMMIT_RANGE="$chunk_range" \
  RELEASE_DATE="$release_date" \
  RELEASE_BRANCH="$branch" \
  ENTRY_ALREADY_EXISTS="$entry_exists" \
  PREVIOUS_VERSION="$previous_version" \
  PREVIOUS_DATE="$previous_date" \
  RELEASE_STATUS="$release_status" \
  RELEASE_CHUNK_INDEX="$chunk_index" \
  RELEASE_CHUNK_COUNT="$chunk_total" \
  RELEASE_CHUNK_COMMIT_COUNT="$chunk_commit_count" \
  RELEASE_CHUNK_PREVIOUS_COMMIT="$chunk_prev_commit" \
  RELEASE_CHUNK_EXCLUDE_MARKER="$chunk_exclude_marker" \
  RELEASE_CHUNK_FIRST_COMMIT="$chunk_first_commit" \
  RELEASE_CHUNK_LAST_COMMIT="$chunk_last_commit" \
  RELEASE_COMMIT_TOTAL="$total_commit_count" \
  RELEASE_COMMIT_RANGE_FULL="$commit_range_full" \
  PACKAGE_VERSION="$pkg_version" \
  PACKAGE_VERSION_IS_PRERELEASE="$pkg_version_is_prerelease" \
  HOME="$CODEX_RUNTIME_HOME" \
  codex exec --sandbox workspace-write --cd "$REPO_ROOT" -- <<EOF
!! AUTOMATION NOTICE !!
- Immediately execute the shell command \`{"command":["bash","-lc","git log --reverse --stat \\"${chunk_range}\\""]}\`.
- Open every player-facing commit you rely on with individual \`git show <hash>\` commands (e.g. \`{"command":["bash","-lc","git show 1234abcd"]}\`) before writing notes.
- The workflow aborts when these commands are skipped—run them now, then proceed with the steps below.

${prompt_body}

---
IMPORTANT: After outlining your plan, immediately execute the listed commands via tool calls in this run. Do not send another assistant message until you have run at least \`git log --reverse --stat "${chunk_range}"\` and inspected every relevant commit; the workflow aborts when no tools are used.
---
Existing release history (newest → oldest):
${history_snapshot}

---
Context for this run:
- Scope: in-progress HEAD window (chunk ${chunk_index}/${chunk_total})
- Current package version: ${pkg_version}
- Package build is prerelease: ${pkg_version_is_prerelease}
- Target release version (sanitised): v${target_version}
- Release status: ${release_status_human}
- Previous release marker: ${previous_release_marker:-<none>} (v${previous_version:-n/a}, released ${previous_date:-n/a})
- Full commit span under review: ${commit_range_full}
- Commit range to inspect in this chunk: ${chunk_range}
- Commits in this chunk: ${chunk_commit_count}/${total_commit_count}
- Previous chunk last commit: ${chunk_prev_commit_display}
- Range exclude marker used for git diff/log: ${chunk_exclude_display}
- Release commit (HEAD at invocation): ${release_commit}
- Planned release date for heading: ${release_date}
- History entry already exists: ${entry_exists}
- Branch scanned: ${branch}

Quick commit summary (newest first):
${summary_log}

Changed files (git diff --stat):
${diff_stat}

    Top-level directories touched:
${component_summary}
EOF

  if ! verify_codex_session_activity "$previous_session_path" "in-progress v${target_version} chunk ${chunk_index}/${chunk_total}" "git log --reverse --stat"; then
    echo "Warning: in-progress chunk ${chunk_index}/${chunk_total} relied on pre-supplied context; review docs/HISTORY.txt manually." >&2
  fi
  ensure_history_entry "$target_version" "$entry_before" "$require_change"
  echo "Completed Codex run for in-progress v${target_version} chunk ${chunk_index}/${chunk_total}." >&2
}

initial_history_empty="false"
if [[ -z "$latest_history_version" ]]; then
  initial_history_empty="true"
  process_all="true"
fi

declare -a candidates
if [[ -n "${RELEASE_NOTES_BRANCH:-}" ]]; then
  candidates+=("$RELEASE_NOTES_BRANCH")
fi
candidates+=("origin/master" "master" "origin/main" "main" "HEAD")

BRANCH=""
for candidate in "${candidates[@]}"; do
  if git rev-parse --verify --quiet "${candidate}^{commit}" >/dev/null; then
    BRANCH="$candidate"
    break
  fi
done

if [[ -z "$BRANCH" ]]; then
  echo "Unable to resolve a branch to scan (checked: ${candidates[*]})." >&2
  exit 1
fi

echo "Release history catch-up: scanning branch $BRANCH" >&2

mapfile -t release_lines < <(git log --format='%H|%cs|%s' --grep '^v[0-9]\+\.[0-9]\+\.[0-9]\+$' "$BRANCH")

declare -a release_commits=()
declare -a release_dates=()
declare -a release_versions=()
declare -A release_version_map=()

for idx in "${!release_lines[@]}"; do
  line="${release_lines[$idx]}"
  IFS='|' read -r commit iso_date subject <<<"$line"
  version="${subject#v}"
  release_commits+=("$commit")
  release_dates+=("$iso_date")
  release_versions+=("$version")
  release_version_map["$version"]=$idx
done

declare -a missing_indices=()
for idx in "${!release_versions[@]}"; do
  version="${release_versions[$idx]}"
  if [[ -z "${history_versions[$version]:-}" ]]; then
    missing_indices+=("$idx")
  fi
done

if [[ "$process_all" != "true" && "${#missing_indices[@]}" -gt 1 ]]; then
  newest_idx=$(printf '%s\n' "${missing_indices[@]}" | sort -n | head -n 1)
  echo "Multiple release entries are missing; defaulting to the newest gap (v${release_versions[$newest_idx]}). Pass --all to backfill everything." >&2
  missing_indices=("$newest_idx")
fi

if [[ "${#missing_indices[@]}" -gt 0 ]]; then
  mapfile -t missing_indices < <(printf '%s\n' "${missing_indices[@]}" | sort -nr)
fi

for idx in "${missing_indices[@]}"; do
  commit="${release_commits[$idx]}"
  version="${release_versions[$idx]}"
  iso_date="${release_dates[$idx]}"

  previous_commit=""
  if [[ $idx -lt $((${#release_commits[@]} - 1)) ]]; then
    previous_commit="${release_commits[$((idx + 1))]}"
  fi

  if [[ -n "$previous_commit" ]]; then
    commit_range="${previous_commit}..${commit}"
  else
    commit_range="${commit}"
  fi

  declare -a chunk_ranges=()
  declare -a chunk_exclude_markers=()
  declare -a chunk_prev_commits=()
  declare -a chunk_first_commits=()
  declare -a chunk_last_commits=()
  declare -a chunk_commit_counts=()
  total_commit_count=0
  chunk_total=0

  collect_commit_chunks "$commit_range" "$previous_commit" total_commit_count chunk_total chunk_ranges chunk_exclude_markers chunk_prev_commits chunk_first_commits chunk_last_commits chunk_commit_counts

  if (( chunk_total > 1 )); then
    echo "Commit range ${commit_range} spans ${total_commit_count} commits; splitting into ${chunk_total} chunks (max ${MAX_COMMITS_PER_CHUNK} per run)." >&2
  fi

  for chunk_idx in "${!chunk_ranges[@]}"; do
    chunk_range_spec="${chunk_ranges[$chunk_idx]}"
    chunk_commit_count="${chunk_commit_counts[$chunk_idx]}"
    chunk_prev_commit="${chunk_prev_commits[$chunk_idx]}"
    chunk_exclude_marker="${chunk_exclude_markers[$chunk_idx]}"
    chunk_first_commit="${chunk_first_commits[$chunk_idx]}"
    chunk_last_commit="${chunk_last_commits[$chunk_idx]}"
    chunk_number=$((chunk_idx + 1))
    require_change="0"
    if [[ "$chunk_idx" -eq 0 ]]; then
      require_change="1"
    fi
    run_released_codex_chunk \
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
      "$chunk_exclude_marker" \
      "$chunk_first_commit" \
      "$chunk_last_commit" \
      "$require_change"
  done
done

# Refresh HISTORY.txt state now that new releases may be recorded.
parse_history

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to inspect package.json." >&2
  exit 1
fi

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

pkg_version_is_prerelease="false"
if [[ "$pkg_version" == *-* ]]; then
  pkg_version_is_prerelease="true"
fi

if [[ -n "${release_version_map[$target_version]:-}" ]]; then
  echo "Latest package version (v${target_version}) already has a release commit; no in-progress notes to update." >&2
else
  previous_commit=""
  previous_version=""
  previous_date=""
  if [[ "${#release_commits[@]}" -gt 0 ]]; then
    previous_commit="${release_commits[0]}"
    previous_version="${release_versions[0]}"
    previous_date="${release_dates[0]}"
  fi

  if [[ -n "$previous_commit" ]]; then
    commit_range="${previous_commit}..HEAD"
  else
    commit_range="HEAD"
  fi

  commit_count=$(git rev-list --count "$commit_range")
  if [[ "$commit_count" -eq 0 ]]; then
    echo "No commits found between the last release and HEAD; skipping in-progress notes update." >&2
  else
    entry_exists="false"
    if [[ -n "${history_versions[$target_version]:-}" ]]; then
      entry_exists="true"
    fi

    release_date="${RELEASE_NOTES_DATE:-$(date +%F)}"
    release_branch_current="$(git rev-parse --abbrev-ref HEAD)"
    release_commit_head="$(git rev-parse HEAD)"

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

    declare -a chunk_ranges=()
    declare -a chunk_exclude_markers=()
    declare -a chunk_prev_commits=()
    declare -a chunk_first_commits=()
    declare -a chunk_last_commits=()
    declare -a chunk_commit_counts=()
    total_commit_count=0
    chunk_total=0

    collect_commit_chunks "$commit_range" "$previous_commit" total_commit_count chunk_total chunk_ranges chunk_exclude_markers chunk_prev_commits chunk_first_commits chunk_last_commits chunk_commit_counts

    if (( chunk_total > 1 )); then
      echo "In-progress range ${commit_range} spans ${total_commit_count} commits; splitting into ${chunk_total} chunks (max ${MAX_COMMITS_PER_CHUNK} per run)." >&2
    else
      echo "Dispatching Codex for in-progress v${target_version} (range ${commit_range})." >&2
    fi

    for chunk_idx in "${!chunk_ranges[@]}"; do
      chunk_range_spec="${chunk_ranges[$chunk_idx]}"
      chunk_commit_count="${chunk_commit_counts[$chunk_idx]}"
      chunk_prev_commit="${chunk_prev_commits[$chunk_idx]}"
      chunk_exclude_marker="${chunk_exclude_markers[$chunk_idx]}"
      chunk_first_commit="${chunk_first_commits[$chunk_idx]}"
      chunk_last_commit="${chunk_last_commits[$chunk_idx]}"
      chunk_number=$((chunk_idx + 1))
      require_change="0"
      if [[ "$chunk_idx" -eq 0 ]]; then
        require_change="1"
      fi

      run_inprogress_codex_chunk \
        "$pkg_version" \
        "$target_version" \
        "$release_commit_head" \
        "$previous_commit" \
        "$release_branch_current" \
        "$release_date" \
        "$release_status" \
        "$release_status_human" \
        "$entry_exists" \
        "$previous_version" \
        "$previous_date" \
        "$commit_range" \
        "$total_commit_count" \
        "$chunk_number" \
        "$chunk_total" \
        "$chunk_range_spec" \
        "$chunk_commit_count" \
        "$chunk_prev_commit" \
        "$chunk_exclude_marker" \
        "$chunk_first_commit" \
        "$chunk_last_commit" \
        "$pkg_version_is_prerelease" \
        "$require_change"

      if [[ -n "${history_versions[$target_version]:-}" ]]; then
        entry_exists="true"
      fi
    done
  fi
fi

echo "Release-notes workflow finished. Review docs/HISTORY.txt for the latest entries." >&2
