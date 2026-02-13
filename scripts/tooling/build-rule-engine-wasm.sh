#!/usr/bin/env bash
set -euo pipefail

# Build the Rust matcher crate to wasm32 output.
# Default profile is release so performance runs exercise optimized wasm.
# Override with WASM_RULE_ENGINE_PROFILE=dev for faster local iteration.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CRATE_DIR="${REPO_ROOT}/wasm/rule_engine"
OUT_DIR="${REPO_ROOT}/src/lib/wasm/generated"
PROFILE="${WASM_RULE_ENGINE_PROFILE:-release}"
TARGET_DIR_NAME="debug"
if [[ "${PROFILE}" == "release" ]]; then
  TARGET_DIR_NAME="release"
fi

# Compile the crate using the installed Rust toolchain and wasm target.
cd "${CRATE_DIR}"
if [[ "${PROFILE}" == "release" ]]; then
  # Some Linux toolchains fail release links with strip enabled for proc-macro
  # dependencies. Default to strip=none unless the caller overrides it.
  CARGO_PROFILE_RELEASE_STRIP="${CARGO_PROFILE_RELEASE_STRIP:-none}" \
    "${HOME}/.cargo/bin/cargo" build --release --target wasm32-unknown-unknown
else
  "${HOME}/.cargo/bin/cargo" build --target wasm32-unknown-unknown
fi

# Regenerate JS bindings + .d.ts from the compiled wasm artifact.
mkdir -p "${OUT_DIR}"
"${HOME}/.cargo/bin/wasm-bindgen" \
  "${CRATE_DIR}/target/wasm32-unknown-unknown/${TARGET_DIR_NAME}/rule_engine.wasm" \
  --target web \
  --out-dir "${OUT_DIR}"
