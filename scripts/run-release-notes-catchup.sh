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
  parse_history
  if [[ -z "${history_versions[$expected_version]:-}" ]]; then
    echo "Codex run completed, but docs/HISTORY.txt still lacks v${expected_version}." >&2
    echo "Review the output above, resolve any issues, and rerun the release-notes workflow." >&2
    exit 1
  fi
  if [[ -n "$previous_snapshot" ]]; then
    local current_snapshot
    current_snapshot="$(capture_history_entry "$expected_version")"
    if [[ "$current_snapshot" == "$previous_snapshot" ]]; then
      echo "Codex finished, but the v${expected_version} entry is unchanged." >&2
      echo "Re-run the workflow or update docs/HISTORY.txt manually if updates are still required." >&2
      exit 1
    fi
  fi
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

  commit_count=$(git rev-list --count "$commit_range")
  diff_stat=$(git diff --stat "$commit_range")
  component_summary=$(git diff --name-only "$commit_range" | awk -F'/' 'NF {print $1}' | sort | uniq -c | sort -nr)

  echo "Dispatching Codex for released v${version} (commit ${commit}, range ${commit_range})." >&2

  summary_log=$(git log --oneline --decorate=short --color=never "$commit_range")
  history_snapshot=$(cat "$HISTORY_PATH")
  prompt_body=$(cat "$PROMPT_PATH")
  entry_before="$(capture_history_entry "$version")"

  prepare_codex_runtime_home
  TARGET_VERSION="$version" \
  RELEASE_COMMIT="$commit" \
  PREVIOUS_MARKER="$previous_commit" \
  COMMIT_RANGE="$commit_range" \
  RELEASE_DATE="$iso_date" \
  RELEASE_BRANCH="$BRANCH" \
  HOME="$CODEX_RUNTIME_HOME" \
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

  ensure_history_entry "$version" "$entry_before"
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
    summary_log=$(git log --oneline --decorate=short --color=never "$commit_range")
    diff_stat=$(git diff --stat "$commit_range")
    component_summary=$(git diff --name-only "$commit_range" | awk -F'/' 'NF {print $1}' | sort | uniq -c | sort -nr)
    history_snapshot=$(cat "$HISTORY_PATH")
    prompt_body=$(cat "$PROMPT_PATH")
    entry_before="$(capture_history_entry "$target_version")"

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

    echo "Dispatching Codex for in-progress v${target_version} (range ${commit_range})." >&2

    prepare_codex_runtime_home
    TARGET_VERSION="$target_version" \
    RELEASE_COMMIT="$release_commit_head" \
    PREVIOUS_MARKER="$previous_commit" \
    COMMIT_RANGE="$commit_range" \
    RELEASE_DATE="$release_date" \
    RELEASE_BRANCH="$release_branch_current" \
    ENTRY_ALREADY_EXISTS="$entry_exists" \
    PREVIOUS_VERSION="$previous_version" \
    PREVIOUS_DATE="$previous_date" \
    RELEASE_STATUS="$release_status" \
    HOME="$CODEX_RUNTIME_HOME" \
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
- Release status: ${release_status_human}

Quick commit summary (newest first):
${summary_log}

Changed files (git diff --stat):
${diff_stat}

    Top-level directories touched:
${component_summary}
EOF

    ensure_history_entry "$target_version" "$entry_before"
    echo "Completed Codex run for in-progress v${target_version}." >&2
  fi
fi

echo "Release-notes workflow finished. Review docs/HISTORY.txt for the latest entries." >&2
