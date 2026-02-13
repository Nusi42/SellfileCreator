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

# Resolve cargo from PATH first so Windows/WSL environments that expose cargo
# differently still work. Fall back to the conventional cargo home location.
CARGO_BIN="${CARGO_BIN:-$(command -v cargo || true)}"
if [[ -z "${CARGO_BIN}" && -x "${HOME}/.cargo/bin/cargo" ]]; then
  CARGO_BIN="${HOME}/.cargo/bin/cargo"
fi

# Resolve wasm-bindgen in the same way as cargo so generated bindings are
# produced consistently across shells/platforms.
WASM_BINDGEN_BIN="${WASM_BINDGEN_BIN:-$(command -v wasm-bindgen || true)}"
if [[ -z "${WASM_BINDGEN_BIN}" && -x "${HOME}/.cargo/bin/wasm-bindgen" ]]; then
  WASM_BINDGEN_BIN="${HOME}/.cargo/bin/wasm-bindgen"
fi

# Fail early with actionable guidance instead of producing a less clear build
# failure later in the script.
if [[ -z "${CARGO_BIN}" ]]; then
  echo "error: cargo not found. Install Rust via rustup for this environment." >&2
  exit 1
fi
if [[ -z "${WASM_BINDGEN_BIN}" ]]; then
  echo "error: wasm-bindgen not found. Run: cargo install wasm-bindgen-cli" >&2
  exit 1
fi

# Regenerate shared TS/Rust domain constants before compiling the crate so
# sentinel values remain synchronized across both implementations.
node "${REPO_ROOT}/scripts/tooling/generate-domain-constants.mjs"

# Compile the crate using the installed Rust toolchain and wasm target.
cd "${CRATE_DIR}"
if [[ "${PROFILE}" == "release" ]]; then
  # Some Linux toolchains fail release links with strip enabled for proc-macro
  # dependencies. Default to strip=none unless the caller overrides it.
  CARGO_PROFILE_RELEASE_STRIP="${CARGO_PROFILE_RELEASE_STRIP:-none}" \
    "${CARGO_BIN}" build --release --target wasm32-unknown-unknown
else
  "${CARGO_BIN}" build --target wasm32-unknown-unknown
fi

# Regenerate JS bindings + .d.ts from the compiled wasm artifact.
mkdir -p "${OUT_DIR}"
"${WASM_BINDGEN_BIN}" \
  "${CRATE_DIR}/target/wasm32-unknown-unknown/${TARGET_DIR_NAME}/rule_engine.wasm" \
  --target web \
  --out-dir "${OUT_DIR}"
