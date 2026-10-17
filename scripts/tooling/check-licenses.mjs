#!/usr/bin/env node
/**
 * check-licenses — dependency license policy (`npm run check:licenses`, part of test:all).
 *
 * The project is AGPL-3.0-or-later and also offered under other terms by its maintainer,
 * so no dependency may carry a GPL-family license (GPL, LGPL, AGPL): such
 * code could never go into the other editions. Checks:
 *   - every installed npm package listed in package-lock.json (dev tools included, so a
 *     copyleft tool can never slip into a build step unnoticed);
 *   - every Rust crate of the wasm/ workspace, via `cargo deny check licenses`
 *     (allowlist in wasm/deny.toml).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
// GPL family in any SPDX spelling (GPL-2.0-only, LGPL-3.0-or-later, AGPL-3.0, "GPLv3", ...).
const COPYLEFT_RE = /\b(A|L)?GPL/i

// The license expression a package declares (SPDX string, legacy object or array form).
function declaredLicense(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(' OR ')
  return undefined
}

// True when an SPDX expression leaves a non-copyleft choice: every OR branch is checked,
// and one permissive branch is enough ("MIT OR GPL-3.0" may be used under MIT).
const hasPermissiveChoice = (expr) => expr.split(/\s+OR\s+/i).some((branch) => !COPYLEFT_RE.test(branch))

const problems = []
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'))
let checked = 0
for (const key of Object.keys(lock.packages ?? {})) {
  if (key === '') continue
  const manifest = path.join(ROOT, key, 'package.json')
  // Optional platform packages for other systems are listed but never installed here.
  if (!fs.existsSync(manifest)) continue
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  const license = declaredLicense(pkg)
  checked++
  if (license === undefined) problems.push(`${key}: no license declared`)
  else if (!hasPermissiveChoice(license)) problems.push(`${key}: ${license}`)
}

try {
  execFileSync('cargo', ['deny', '--manifest-path', 'wasm/Cargo.toml', 'check', 'licenses'], { cwd: ROOT, stdio: 'inherit' })
} catch {
  problems.push('cargo deny check licenses failed (see above); install it with `cargo install cargo-deny` if missing')
}

if (problems.length > 0) {
  for (const p of problems) console.error(`license: ${p}`)
  console.error(`\nlicenses: ${problems.length} problem(s). Dependencies must not be GPL-family licensed.`)
  process.exitCode = 1
} else {
  console.log(`licenses: ${checked} npm packages and the Rust workspace ok`)
}
