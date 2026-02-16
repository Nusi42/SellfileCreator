#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = fileURLToPath(new URL('.', import.meta.url))
// Resolve repo root from scripts/test.
const root = join(here, '..', '..')
// Keep test artifacts isolated from script artifacts.
const tmpOutDir = join(root, 'tmp', 'tsc', 'tests')
// Compile outputs mirror repo-root-relative paths (e.g., tests/**).
const tmpTestsDir = join(tmpOutDir, 'tests')
const testsDir = join(root, 'tests')
// Keep wasm helper artifacts available in compiled test output when source files
// import wasm wrappers in shared builder modules.
const wasmGeneratedSrcDir = join(root, 'src', 'lib', 'wasm', 'generated')
const wasmGeneratedOutDir = join(tmpOutDir, 'src', 'lib', 'wasm', 'generated')

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    const message = `Command "${[command, ...args].join(' ')}" exited with status ${result.status}`
    const error = new Error(message)
    error.exitCode = result.status
    throw error
  }
}

function collectTestSources(dir) {
  if (!existsSync(dir)) return []
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTestSources(path))
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
        files.push(path)
      }
    }
  }
  return files
}

function collectCompiledTests() {
  const sources = collectTestSources(testsDir)
  if (sources.length === 0) return []
  return sources
    .map((source) => {
      const relativePath = relative(testsDir, source)
      const compiledName = relativePath.replace(/\.tsx?$/, '.js').split(sep).join(sep)
      return join(tmpTestsDir, compiledName)
    })
    .filter((compiled) => existsSync(compiled))
}

try {
  // Reset only the test output root so stale artifacts do not linger.
  rmSync(tmpOutDir, { recursive: true, force: true })

  const localTsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  if (existsSync(localTsc)) {
    run(process.execPath, [localTsc, '-p', 'tsconfig.tests.json'])
  } else {
    run('tsc', ['-p', 'tsconfig.tests.json'])
  }
  // Patch ESM imports in compiled artifacts so Node can resolve them.
  run(process.execPath, ['scripts/tooling/patch-esm-specifiers.cjs'])
  // Mirror generated wasm bindings so compiled test modules can import them.
  if (existsSync(wasmGeneratedSrcDir)) {
    mkdirSync(wasmGeneratedOutDir, { recursive: true })
    cpSync(wasmGeneratedSrcDir, wasmGeneratedOutDir, { recursive: true })
  }
  // Run the HSFC fixture harness before node:test specs.
  run(process.execPath, ['tmp/tsc/tests/tests/integration/hsfc-fixtures.runner.js'])
  // Run the sample2-bundle matcher regression harness to guard safeguard
  // injection payload integrity and primary/base match invariants.
  run(process.execPath, ['tmp/tsc/tests/tests/integration/sample2-matcher.runner.js'])

  const compiledTests = collectCompiledTests()
  if (compiledTests.length > 0) {
    // Force single-file execution.
    // Why: The gear DB importer tests exercise WASM + large ArrayBuffers and Node's default
    // parallel file runner has shown intermittent internal stream crashes (SIGSEGV / undefined
    // internal symbols) under CI-like resource constraints.
    const nodeArgs = [
      '--experimental-wasm-modules',
      '--import',
      './tmp/tsc/tests/tests/setup/wasm-warmup.js',
      '--test',
      '--test-concurrency=1',
      ...compiledTests,
    ]
    run(process.execPath, nodeArgs)
  } else if (process.env.CI) {
    console.warn('Warning: no node:test specs found under tests/')
  }
} catch (error) {
  if (typeof error?.exitCode === 'number') {
    process.exit(error.exitCode)
  }
  console.error(error)
  process.exit(1)
}
