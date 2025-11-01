#!/usr/bin/env node

import { rmSync, existsSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = join(here, '..')
const tmpDir = join(root, 'scripts', '.tmp')
const tmpTestsDir = join(tmpDir, 'tests')
const testsDir = join(root, 'tests')

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
  // Reset the temp directory so old compiled tests do not linger.
  rmSync(tmpDir, { recursive: true, force: true })

  const localTsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  if (existsSync(localTsc)) {
    run(process.execPath, [localTsc, '-p', 'tsconfig.tests.json'])
  } else {
    run('tsc', ['-p', 'tsconfig.tests.json'])
  }
  run(process.execPath, ['scripts/patch-esm-specifiers.cjs'])
  run(process.execPath, ['scripts/.tmp/tests/file-hsfc-e2e.js'])

  const compiledTests = collectCompiledTests()
  if (compiledTests.length > 0) {
    run(process.execPath, ['--test', ...compiledTests])
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
