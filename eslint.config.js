// Flat ESLint config (ESLint v10+)
// TS-first, ESLint React, React hooks, import rules, and targeted ignores.
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import eslintReact from '@eslint-react/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactYouMightNotNeedAnEffectPlugin from 'eslint-plugin-react-you-might-not-need-an-effect';
import importPlugin from 'eslint-plugin-import-x';
import globals from 'globals';

export default [
  // Ignore generated/output folders and archived references
  {
    ignores: [
      'dist.app/**',
      'dist.web/**',
      'node_modules/**',
      'src-tauri/**',
      'tmp/tsc/**',
      'scripts/.tmp/**',
      'docs/reference/**',
      // wasm-bindgen output is generated code; linting it creates non-actionable warnings.
      'src/lib/wasm/generated/**',
      // Rust build artifacts — cargo doc generates thousands of .js files that
      // are not part of the TS project and cause ESLint to segfault on large runs.
      'wasm/target/**',
      // ts-rs generated TypeScript bindings — generated code, not part of the app source.
      'wasm/rule_engine_core/bindings/**',
      'wasm/rule_engine_wasm/bindings/**',
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // Project rules for app source, tests, and scripts
  {
    files: [
      'src/**/*.{ts,tsx,js,jsx}',
      'tests/playwright/**/*.{ts,tsx,js,jsx}',
      'tests/**/*.{ts,tsx,js,jsx}',
      'scripts/**/*.{ts,js,mjs,cjs}',
      'vite.config.ts'
    ],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2021,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      // ESLint React (replaces eslint-plugin-react) — register all sub-plugins from the preset
      ...eslintReact.configs['recommended-typescript'].plugins,
      'react-hooks': reactHooksPlugin,
      'react-you-might-not-need-an-effect': reactYouMightNotNeedAnEffectPlugin,
      import: importPlugin,
    },
    settings: {
      // Enable TypeScript path/resolution for eslint-plugin-import
      'import/resolver': { typescript: {} },
    },
    rules: {
      // Defer unused var checks to TS-aware rule; allow underscore-prefixed
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      // Enforce no explicit any in general
      '@typescript-eslint/no-explicit-any': 'error',
      // Allow empty catch blocks (we intentionally swallow in many UI spots)
      'no-empty': ['error', { allowEmptyCatch: true }],

      // ── ESLint React recommended-typescript preset + disable RSC (client-only SPA) ──
      ...eslintReact.configs['recommended-typescript'].rules,
      ...eslintReact.configs['disable-rsc'].rules,

      // ── React Hooks v7 full recommended (includes React Compiler rules) ──
      ...reactHooksPlugin.configs['recommended-latest'].rules,

      // ── "You Might Not Need an Effect" rules as warnings for triage ──
      ...reactYouMightNotNeedAnEffectPlugin.configs.recommended.rules,
      'react-you-might-not-need-an-effect/no-empty-effect': 'warn',
      'react-you-might-not-need-an-effect/no-initialize-state': 'warn',
    },
  },
  // Apply unused-modules check only to app code and tests (not scripts/config)
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      // FileEnumerator was removed in ESLint 10; import-x will implement an alternative.
      // suppressMissingFileEnumeratorAPIWarning silences the deprecation notice in the meantime.
      'import/no-unused-modules': ['error', {
        unusedExports: true,
        missingExports: true,
        // Entry points that are consumed outside the module graph (bundler, test runner, workers).
        ignoreExports: [
          'src/main.tsx',
          'src/workers/dungeonSimulatorWorker.ts',
          'src/workers/ruleCacheWorker.ts',
          'src/types/static-assets.d.ts',
          'src/lib/prismDynamicOverrides.ts',
          'src/lib/prismEbnf.ts',
        ],
        suppressMissingFileEnumeratorAPIWarning: true,
      }],
    },
  },
  {
    files: ['tests/playwright/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'import/no-unused-modules': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  // TypeScript-specific tweaks
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Typescript already handles undefined symbols; prevents false positives for JSX/TS types
      'no-undef': 'off',
    },
  },
];
