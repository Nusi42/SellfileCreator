#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PROMPT_PATH="docs/CREATE-RELEASE-NOTES.md"
HISTORY_PATH="docs/HISTORY.txt"

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

  commit_count=$(git rev-list --count "$commit_range")
  diff_stat=$(git diff --stat "$commit_range")
  component_summary=$(git diff --name-only "$commit_range" | awk -F'/' 'NF {print $1}' | sort | uniq -c | sort -nr)

  echo "Dispatching Codex for released v${version} (commit ${commit}, range ${commit_range})." >&2

  summary_log=$(git log --oneline --decorate=short --color=never "$commit_range")
  history_snapshot=$(cat "$HISTORY_PATH")
  prompt_body=$(cat "$PROMPT_PATH")

  TARGET_VERSION="$version" \
  RELEASE_COMMIT="$commit" \
  PREVIOUS_MARKER="$previous_commit" \
  COMMIT_RANGE="$commit_range" \
  RELEASE_DATE="$iso_date" \
  RELEASE_BRANCH="$BRANCH" \
  codex exec --sandbox workspace-write --cd "$REPO_ROOT" -- <<EOF
${prompt_body}

---
Existing release history (newest → oldest):
${history_snapshot}

---
Context for this run:
- Scope: released commit
- Target version: v${version}
- Release commit: ${commit}
- Previous marker: ${previous_commit:-<none>}
- Commit range: ${commit_range}
- Release date: ${iso_date}
- Branch scanned: ${BRANCH}
- Commit count in range: ${commit_count}

Quick commit summary (newest first):
${summary_log}

Changed files (git diff --stat):
${diff_stat}

Top-level directories touched:
${component_summary}
EOF

  echo "Completed Codex run for released v${version}." >&2
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
    summary_log=$(git log --oneline --decorate=short --color=never "$commit_range")
    diff_stat=$(git diff --stat "$commit_range")
    component_summary=$(git diff --name-only "$commit_range" | awk -F'/' 'NF {print $1}' | sort | uniq -c | sort -nr)
    history_snapshot=$(cat "$HISTORY_PATH")
    prompt_body=$(cat "$PROMPT_PATH")

    echo "Dispatching Codex for in-progress v${target_version} (range ${commit_range})." >&2

    TARGET_VERSION="$target_version" \
    RELEASE_COMMIT="$release_commit_head" \
    PREVIOUS_MARKER="$previous_commit" \
    COMMIT_RANGE="$commit_range" \
    RELEASE_DATE="$release_date" \
    RELEASE_BRANCH="$release_branch_current" \
    ENTRY_ALREADY_EXISTS="$entry_exists" \
    PREVIOUS_VERSION="$previous_version" \
    PREVIOUS_DATE="$previous_date" \
    codex exec --sandbox workspace-write --cd "$REPO_ROOT" -- <<EOF
${prompt_body}

---
Existing release history (newest → oldest):
${history_snapshot}

---
Context for this run:
- Scope: in-progress HEAD window
- Current package version: ${pkg_version}
- Target release version (sanitised): v${target_version}
- Previous release marker: ${previous_commit:-<none>} (v${previous_version:-n/a})
- Commit range to inspect: ${commit_range}
- Release commit (HEAD at invocation): ${release_commit_head}
- Planned release date for heading: ${release_date}
- History entry already exists: ${entry_exists}
- Branch scanned: ${release_branch_current}
- Commit count in range: ${commit_count}

Quick commit summary (newest first):
${summary_log}

Changed files (git diff --stat):
${diff_stat}

Top-level directories touched:
${component_summary}
EOF

    echo "Completed Codex run for in-progress v${target_version}." >&2
  fi
fi

echo "Release-notes workflow finished. Review docs/HISTORY.txt for the latest entries." >&2
