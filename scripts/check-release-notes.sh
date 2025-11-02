#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

HISTORY_PATH="docs/HISTORY.txt"

if [[ ! -f "$HISTORY_PATH" ]]; then
  echo "docs/HISTORY.txt is missing. Run the catch-up flow before releasing." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to read package.json." >&2
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

declare -A history_versions=()
line_number=0
while IFS= read -r raw_line; do
  line_number=$((line_number + 1))
  line="${raw_line//$'\r'/}"
  if [[ "$line_number" -eq 1 && "${line:0:1}" == $'\ufeff' ]]; then
    line="${line#?}"
  fi
  if [[ "$line" =~ ^##[[:space:]]+v([0-9]+\.[0-9]+\.[0-9]+) ]]; then
    history_versions["${BASH_REMATCH[1]}"]=1
  fi
done <"$HISTORY_PATH"

if [[ -z "${history_versions[$target_version]:-}" ]]; then
  echo "Missing release notes: docs/HISTORY.txt has no entry for v${target_version}." >&2
  echo "Run 'npm run release-notes:catchup' to draft or refresh that entry before packaging (add '-- --all' if you need to rebuild older releases too)." >&2
  exit 2
fi

mapfile -t release_lines < <(git log --format='%s' --grep '^v[0-9]\+\.[0-9]\+\.[0-9]\+$')
declare -a missing_releases=()
for subject in "${release_lines[@]}"; do
  version="${subject#v}"
  if [[ -z "${history_versions[$version]:-}" ]]; then
    missing_releases+=("$version")
  fi
done

if [[ "${#missing_releases[@]}" -gt 0 ]]; then
  printf 'Historic release commits missing from HISTORY.txt: %s\n' "$(IFS=', '; echo "${missing_releases[*]}")" >&2
  echo "Run 'npm run release-notes:catchup' to fill the gaps." >&2
  exit 3
fi

echo "Release notes check passed: docs/HISTORY.txt covers v${target_version} and prior releases." >&2
