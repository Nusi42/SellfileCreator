#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// Single definition of the wasm build profile and of the stamp that records which
// profile produced the checked-in generated outputs.
//
// Why the stamp exists: both wasm build scripts write their wasm-bindgen output into
// the SAME src/lib/wasm/generated/ directory regardless of profile, and both ensure
// scripts decide "up to date" purely from file mtimes. Without a profile marker a
// debug-profile artifact left behind by `WASM_RULE_ENGINE_PROFILE=debug npm run dev`
// looks perfectly fresh to a later release build, which then skips the rebuild and
// ships the unoptimized wasm. The stamp makes the profile part of the staleness test.

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')

// The one directory both wasm builds emit into.
export const GENERATED_OUT_DIR = path.join(REPO_ROOT, 'src', 'lib', 'wasm', 'generated')

// Release unless the developer opts into a debug build for fast iteration.
export const resolveProfile = () => (process.env.WASM_RULE_ENGINE_PROFILE ?? 'release')

// Cargo's target subdirectory for a profile — 'release' or 'debug'.
export const targetDirNameFor = (profile) => (profile === 'release' ? 'release' : 'debug')

// One stamp per build script, since the two crates build independently.
const stampPath = (stampName) => path.join(GENERATED_OUT_DIR, `.${stampName}-profile`)

// Record the profile that produced the current outputs. Called after a successful build.
export const writeProfileStamp = (stampName, profile) => {
  fs.mkdirSync(GENERATED_OUT_DIR, { recursive: true })
  fs.writeFileSync(stampPath(stampName), `${profile}\n`, 'utf8')
}

// Read back the recorded profile; null when no build has stamped yet (or it predates
// the stamp), which the ensure scripts treat as "unknown, so rebuild".
export const readProfileStamp = (stampName) => {
  try {
    return fs.readFileSync(stampPath(stampName), 'utf8').trim() || null
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

// True when the existing outputs cannot be trusted for the profile now being requested.
export const profileStampMismatch = (stampName, profile) => readProfileStamp(stampName) !== profile
