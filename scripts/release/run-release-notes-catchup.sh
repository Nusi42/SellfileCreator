#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Anchor at repo root so all paths are predictable.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

PROMPT_MAIN="docs/CREATE-RELEASE-NOTES.md"
PROMPT_WORKER="docs/CREATE-RELEASE-NOTES-WORKER.md"
HISTORY_PATH="userDocs/HISTORY.md"
CHECKLIST_PATH="PRE-RELEASE-CHECKLIST.md"
TEMP_BASE="docs/.release-notes"

# Budgets are measured in changed lines (numstat add+delete), not commit count,
# because a single 8000-line commit is harder to review than 200 small ones.
SINGLE_PASS_LINE_BUDGET="${RELEASE_NOTES_SINGLE_PASS_LINES:-5000}"
WORKER_LINE_BUDGET="${RELEASE_NOTES_WORKER_LINES:-3500}"

# Model selection. Workers do bounded diff inspection (Haiku is enough); the
# reducer / single-pass writes the bilingual final output and judges
# added-then-removed patterns, so Sonnet is the floor. Set either env var to
# an empty string to inherit the CLI's default model.
WORKER_MODEL="${RELEASE_NOTES_WORKER_MODEL-haiku}"
REDUCER_MODEL="${RELEASE_NOTES_REDUCER_MODEL-sonnet}"

process_all="false"

usage() {
  cat <<'EOF'
Usage: npm run release-notes:catchup [-- [--all]]

Options (pass after `--` when using npm):
  --all      Process every missing release entry instead of only the newest gap.
  -h, --help Show this help and exit.

Environment overrides:
  RELEASE_NOTES_CATCHUP_ALL=1            Same as --all.
  RELEASE_NOTES_BRANCH=<ref>             Override which branch is scanned.
  RELEASE_NOTES_DATE=<yyyy-mm-dd>        Override the release date for the in-progress entry.
  RELEASE_NOTES_SINGLE_PASS_LINES=<int>  Switch to map-reduce above this many changed lines (default 5000).
  RELEASE_NOTES_WORKER_LINES=<int>       Per-worker line budget when chunking (default 3500).
  RELEASE_NOTES_WORKER_MODEL=<model>     Claude model for map workers (default 'haiku'; empty to inherit CLI default).
  RELEASE_NOTES_REDUCER_MODEL=<model>    Claude model for reducer / single-pass (default 'sonnet'; empty to inherit CLI default).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) process_all="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

[[ "${RELEASE_NOTES_CATCHUP_ALL:-0}" == "1" ]] && process_all="true"

for path in "$PROMPT_MAIN" "$PROMPT_WORKER" "$HISTORY_PATH"; do
  if [[ ! -f "$path" ]]; then
    echo "Required file missing: $path" >&2
    exit 1
  fi
done

if ! [[ "$SINGLE_PASS_LINE_BUDGET" =~ ^[0-9]+$ ]] || (( SINGLE_PASS_LINE_BUDGET <= 0 )); then
  echo "RELEASE_NOTES_SINGLE_PASS_LINES must be a positive integer (got '$SINGLE_PASS_LINE_BUDGET')." >&2
  exit 1
fi
if ! [[ "$WORKER_LINE_BUDGET" =~ ^[0-9]+$ ]] || (( WORKER_LINE_BUDGET <= 0 )); then
  echo "RELEASE_NOTES_WORKER_LINES must be a positive integer (got '$WORKER_LINE_BUDGET')." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# History parsing
# ---------------------------------------------------------------------------

history_versions=()
latest_history_version=""

parse_history_versions() {
  history_versions=()
  latest_history_version=""
  local line_number=0
  while IFS= read -r raw_line; do
    line_number=$((line_number + 1))
    local line="${raw_line//$'\r'/}"
    # Strip UTF-8 BOM if present on line 1.
    if (( line_number == 1 )) && [[ "${line:0:1}" == $'﻿' ]]; then
      line="${line#?}"
    fi
    if [[ "$line" =~ ^##[[:space:]]+v([0-9]+\.[0-9]+\.[0-9]+) ]]; then
      local version="${BASH_REMATCH[1]}"
      history_versions+=("$version")
      [[ -z "$latest_history_version" ]] && latest_history_version="$version"
    fi
  done <"$HISTORY_PATH"
}

version_in_history() {
  local needle="$1"
  for known in "${history_versions[@]}"; do
    [[ "$known" == "$needle" ]] && return 0
  done
  return 1
}

ensure_history_entry() {
  local version="$1"
  parse_history_versions
  if ! version_in_history "$version"; then
    echo "${HISTORY_PATH} is still missing v${version} after the Claude run. Review the output and fix manually." >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Branch and chunk helpers
# ---------------------------------------------------------------------------

select_branch() {
  local -a candidates=()
  [[ -n "${RELEASE_NOTES_BRANCH:-}" ]] && candidates+=("$RELEASE_NOTES_BRANCH")
  candidates+=("origin/master" "master" "origin/main" "main" "HEAD")
  for ref in "${candidates[@]}"; do
    if git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
      echo "$ref"
      return 0
    fi
  done
  echo "Unable to resolve a branch to scan (checked: ${candidates[*]})." >&2
  return 1
}

range_line_count() {
  # Sum added+deleted across non-binary paths in the range.
  git log --numstat --format= "$1" \
    | awk '$1 != "-" && $2 != "-" { s += $1 + $2 } END { print s+0 }'
}

# Walks commits chronologically and groups them into chunks no larger than
# $WORKER_LINE_BUDGET. A single commit larger than the budget gets its own
# chunk — splitting mid-commit would break the deep-review guarantee.
chunk_ranges=()
collect_chunks_by_size() {
  local range="$1" budget="$2" prev_commit="$3"
  chunk_ranges=()
  local cur_last="" cur_lines=0

  while IFS= read -r commit; do
    local lines
    lines=$(git show --numstat --format= "$commit" \
      | awk '$1 != "-" && $2 != "-" { s += $1 + $2 } END { print s+0 }')

    if [[ -z "$cur_last" ]]; then
      cur_last="$commit"
      cur_lines="$lines"
    elif (( cur_lines + lines > budget )); then
      if [[ -n "$prev_commit" ]]; then
        chunk_ranges+=("${prev_commit}..${cur_last}")
      else
        chunk_ranges+=("${cur_last}")
      fi
      prev_commit="$cur_last"
      cur_last="$commit"
      cur_lines="$lines"
    else
      cur_last="$commit"
      cur_lines=$((cur_lines + lines))
    fi
  done < <(git rev-list --reverse "$range")

  if [[ -n "$cur_last" ]]; then
    if [[ -n "$prev_commit" ]]; then
      chunk_ranges+=("${prev_commit}..${cur_last}")
    else
      chunk_ranges+=("${cur_last}")
    fi
  fi
}

# Extract the "before" side of a `prev..cur` range, or empty for a bare hash.
range_prev_commit() {
  case "$1" in
    *..*) printf '%s' "${1%..*}" ;;
    *)    printf '%s' "" ;;
  esac
}

# ---------------------------------------------------------------------------
# Checklist finalization (mechanical, no AI involvement)
# ---------------------------------------------------------------------------

finalize_checklist() {
  local version="$1" date="$2"
  local src="$TEMP_BASE/$version/checklist.md"
  if [[ ! -s "$src" ]]; then
    echo "No PRE-RELEASE-CHECKLIST items for v${version}." >&2
    return 0
  fi

  # Seed the file with a stable header on first use.
  if [[ ! -f "$CHECKLIST_PATH" ]]; then
    {
      printf '# Pre-Release Checklist\n\n'
      printf 'Maintainer-facing review items collected during release-notes runs. Newest first.\n'
      printf 'Delete entries once handled.\n\n'
    } >"$CHECKLIST_PATH"
  fi

  # Insert the new section after the file's first H1 so newest stays on top.
  local tmp="${CHECKLIST_PATH}.tmp.$$"
  awk -v ver="$version" -v date="$date" -v src="$src" '
    BEGIN { inserted = 0 }
    /^# / && !inserted {
      print
      print ""
      print "## v" ver " — " date
      print ""
      while ((getline line < src) > 0) print line
      close(src)
      print ""
      inserted = 1
      next
    }
    { print }
    END {
      if (!inserted) {
        print "## v" ver " — " date
        print ""
        while ((getline line < src) > 0) print line
        close(src)
        print ""
      }
    }
  ' "$CHECKLIST_PATH" >"$tmp" && mv "$tmp" "$CHECKLIST_PATH"

  echo "Prepended checklist items for v${version} to ${CHECKLIST_PATH}." >&2
}

# ---------------------------------------------------------------------------
# Claude invocation
# ---------------------------------------------------------------------------

# Runs Claude with the given prompt file embedded in the heredoc, plus an
# inline context block. Trailing arguments are KEY=VALUE env exports added on
# top of the existing environment (HOME etc. are inherited).
# Empty $model means "inherit the CLI's default" — no --model flag is added.
run_claude() {
  local prompt_path="$1"; shift
  local model="$1"; shift
  local context="$1"; shift

  local -a model_flag=()
  [[ -n "$model" ]] && model_flag=(--model "$model")

  env "$@" \
    claude -p ${model_flag[@]+"${model_flag[@]}"} --dangerously-skip-permissions --add-dir "$REPO_ROOT" <<EOF
$(cat "$prompt_path")

---
Context for this run:
${context}
EOF
}

# ---------------------------------------------------------------------------
# Single-pass and map-reduce dispatch
# ---------------------------------------------------------------------------

run_single_pass() {
  local version="$1" range="$2" date="$3" status="$4" branch="$5"
  local temp_dir="$TEMP_BASE/$version"
  mkdir -p "$temp_dir"
  : >"$temp_dir/checklist.md"

  local context
  context=$(cat <<EOF
- Branch scanned: ${branch}
- Target version: v${version}
- Release date: ${date}
- Commit range: ${range}
- Release status: ${status}
- Bullets directory: <empty — single-pass; read commits directly>
- Checklist file: ${temp_dir}/checklist.md (append maintainer review items here)
EOF
  )

  echo "Single-pass Claude run for v${version} (range ${range}, model ${REDUCER_MODEL:-<cli default>})." >&2
  run_claude "$PROMPT_MAIN" "$REDUCER_MODEL" "$context" \
    "TARGET_VERSION=$version" \
    "COMMIT_RANGE=$range" \
    "RELEASE_DATE=$date" \
    "RELEASE_STATUS=$status" \
    "BULLETS_DIR=" \
    "CHECKLIST_FILE=$temp_dir/checklist.md"
}

run_map_reduce() {
  local version="$1" range="$2" date="$3" status="$4" branch="$5"
  local temp_dir="$TEMP_BASE/$version"
  mkdir -p "$temp_dir"
  : >"$temp_dir/checklist.md"
  rm -f "$temp_dir"/chunk-*.bullets.md

  local prev; prev="$(range_prev_commit "$range")"
  collect_chunks_by_size "$range" "$WORKER_LINE_BUDGET" "$prev"
  local total="${#chunk_ranges[@]}"
  if (( total == 0 )); then
    echo "Map-reduce for v${version}: no commits in range ${range}." >&2
    return 0
  fi

  echo "Map-reduce for v${version}: ${total} chunk(s), ${WORKER_LINE_BUDGET}-line budget per worker (worker model ${WORKER_MODEL:-<cli default>}, reducer model ${REDUCER_MODEL:-<cli default>})." >&2

  local n=1
  for chunk_range in "${chunk_ranges[@]}"; do
    local out
    out=$(printf '%s/chunk-%03d.bullets.md' "$temp_dir" "$n")
    : >"$out"

    local worker_context
    worker_context=$(cat <<EOF
- Branch scanned: ${branch}
- Target version: v${version}
- Worker: ${n} of ${total}
- Commit range for this worker: ${chunk_range}
- Output bullets file (overwrite): ${out}
- Output checklist file (append-only, shared across workers): ${temp_dir}/checklist.md
EOF
    )

    echo "  Worker ${n}/${total} — range ${chunk_range}" >&2
    run_claude "$PROMPT_WORKER" "$WORKER_MODEL" "$worker_context" \
      "TARGET_VERSION=$version" \
      "COMMIT_RANGE=$chunk_range" \
      "BULLETS_FILE=$out" \
      "CHECKLIST_FILE=$temp_dir/checklist.md"

    n=$((n + 1))
  done

  local reducer_context
  reducer_context=$(cat <<EOF
- Branch scanned: ${branch}
- Target version: v${version}
- Release date: ${date}
- Commit range (full): ${range}
- Release status: ${status}
- Bullets directory: ${temp_dir}
- Checklist file: <empty — workers already populated PRE-RELEASE-CHECKLIST data>
EOF
  )

  echo "  Reducer — consolidating ${total} bullet files into ${HISTORY_PATH}." >&2
  run_claude "$PROMPT_MAIN" "$REDUCER_MODEL" "$reducer_context" \
    "TARGET_VERSION=$version" \
    "COMMIT_RANGE=$range" \
    "RELEASE_DATE=$date" \
    "RELEASE_STATUS=$status" \
    "BULLETS_DIR=$temp_dir" \
    "CHECKLIST_FILE="
}

dispatch_release() {
  local version="$1" range="$2" date="$3" status="$4" branch="$5"

  local lines; lines="$(range_line_count "$range")"
  echo "v${version}: ${lines} changed lines in ${range} (status=${status})." >&2

  if (( lines <= SINGLE_PASS_LINE_BUDGET )); then
    run_single_pass "$version" "$range" "$date" "$status" "$branch"
  else
    echo "Lines exceed single-pass budget (${SINGLE_PASS_LINE_BUDGET}); switching to map-reduce." >&2
    run_map_reduce "$version" "$range" "$date" "$status" "$branch"
  fi

  finalize_checklist "$version" "$date"

  # released-verify can legitimately leave HISTORY.md unchanged because the
  # entry already exists; in that case ensure_history_entry still passes.
  ensure_history_entry "$version"

  # Clean up scratch on success. Failed runs leave the dir behind for inspection.
  rm -rf "$TEMP_BASE/$version"
}

# ---------------------------------------------------------------------------
# Main flow: catch-up missing release entries, then handle in-progress version
# ---------------------------------------------------------------------------

parse_history_versions
# Empty history forces full backfill regardless of --all.
[[ -z "$latest_history_version" ]] && process_all="true"

BRANCH="$(select_branch)"
echo "Release-notes catch-up: scanning ${BRANCH}" >&2

# Every release is a `vX.Y.Z` tag on the commit that shipped. Commit subjects are
# deliberately not used: they are prose, not a stable marker.
# Newest-first by version, which is also chronological order.
release_commits=()
release_dates=()
release_versions=()
while IFS= read -r tag; do
  # Skip anything that is not a plain release tag (e.g. a prerelease name).
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
  # Peel annotated tags to their commit; the commit date is the release date.
  IFS='|' read -r commit iso_date < <(git log -1 --format='%H|%cs' "${tag}^{commit}")
  release_commits+=("$commit")
  release_dates+=("$iso_date")
  release_versions+=("${tag#v}")
done < <(git tag --list 'v[0-9]*' --merged "$BRANCH" --sort=-v:refname)

# Without tags every commit would count as unreleased and the run would summarize the
# entire history into one entry. An existing history proves tags should exist.
if (( ${#release_versions[@]} == 0 )) && [[ -n "$latest_history_version" ]]; then
  echo "No vX.Y.Z release tags are reachable from ${BRANCH}, but ${HISTORY_PATH} already lists v${latest_history_version}. Fetch the tags (git fetch --tags) before running the catch-up." >&2
  exit 1
fi

missing_indices=()
for idx in "${!release_versions[@]}"; do
  version_in_history "${release_versions[$idx]}" || missing_indices+=("$idx")
done

if [[ "$process_all" != "true" && "${#missing_indices[@]}" -gt 1 ]]; then
  newest_idx=$(printf '%s\n' "${missing_indices[@]}" | sort -n | head -n 1)
  echo "Multiple release entries are missing; defaulting to the newest gap (v${release_versions[$newest_idx]}). Pass --all to backfill everything." >&2
  missing_indices=("$newest_idx")
fi

# Sort oldest → newest so backfill respects chronology.
if (( ${#missing_indices[@]} > 0 )); then
  sorted=()
  while IFS= read -r line; do sorted+=("$line"); done \
    < <(printf '%s\n' "${missing_indices[@]}" | sort -nr)
  missing_indices=("${sorted[@]}")
fi

for idx in "${missing_indices[@]}"; do
  commit="${release_commits[$idx]}"
  version="${release_versions[$idx]}"
  iso_date="${release_dates[$idx]}"

  prev_commit=""
  if (( idx < ${#release_commits[@]} - 1 )); then
    prev_commit="${release_commits[$((idx + 1))]}"
  fi

  if [[ -n "$prev_commit" ]]; then
    commit_range="${prev_commit}..${commit}"
  else
    commit_range="$commit"
  fi

  dispatch_release "$version" "$commit_range" "$iso_date" "new-entry" "$BRANCH"
done

# Refresh history before the in-progress check.
parse_history_versions

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
[[ "$pkg_version" == *-* ]] && pkg_version_is_prerelease="true"

# Skip in-progress when the package version is already released (tagged).
release_index=""
for idx in "${!release_versions[@]}"; do
  if [[ "${release_versions[$idx]}" == "$target_version" ]]; then
    release_index="$idx"
    break
  fi
done

if [[ -n "$release_index" ]]; then
  echo "Latest package version (v${target_version}) is already tagged as released; no in-progress notes to update." >&2
else
  prev_commit=""
  if (( ${#release_commits[@]} > 0 )); then
    prev_commit="${release_commits[0]}"
  fi

  if [[ -n "$prev_commit" ]]; then
    commit_range="${prev_commit}..HEAD"
  else
    commit_range="HEAD"
  fi

  commit_count=$(git rev-list --count "$commit_range")
  if (( commit_count == 0 )); then
    echo "No commits between the last release and HEAD; skipping in-progress notes." >&2
  else
    entry_exists="false"
    version_in_history "$target_version" && entry_exists="true"

    release_date="${RELEASE_NOTES_DATE:-$(date +%F)}"
    branch_current="$(git rev-parse --abbrev-ref HEAD)"

    status="new-entry"
    if [[ "$entry_exists" == "true" ]]; then
      if [[ "$pkg_version_is_prerelease" == "true" && "$target_version" == "$latest_history_version" ]]; then
        status="unreleased-extend"
      else
        status="released-verify"
      fi
    fi

    dispatch_release "$target_version" "$commit_range" "$release_date" "$status" "$branch_current"
  fi
fi

echo "Release-notes workflow finished. Review ${HISTORY_PATH} and PRE-RELEASE-CHECKLIST.md." >&2
