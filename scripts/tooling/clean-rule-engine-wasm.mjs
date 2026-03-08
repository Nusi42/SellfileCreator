#!/usr/bin/env node
// Runs `cargo clean` on the wasm workspace so the next `npm run build`
// (or any wasm:ensure invocation) performs a full from-scratch Rust compile.
//
// All generated outputs in src/lib/wasm/generated/ are gitignored artifacts;
// the ensure script detects the absent wasm/target/ directory that cargo clean
// leaves behind and forces a rebuild unconditionally.
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const WORKSPACE_DIR = path.join(REPO_ROOT, 'wasm')

console.log('[wasm:clean] running cargo clean…')
const result = spawnSync('cargo', ['clean'], {
  cwd: WORKSPACE_DIR,
  stdio: 'inherit',
  env: process.env,
})

if (result.error) throw result.error
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)
console.log('[wasm:clean] done. Run `npm run build` (or wasm:build:rule-engine) to rebuild from scratch.')
