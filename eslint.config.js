// Flat ESLint config (ESLint v9+) migrated from .eslintrc.cjs
// Keeps prior intent: TS-first, React, import rules, and targeted ignores.
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactYouMightNotNeedAnEffectPlugin from 'eslint-plugin-react-you-might-not-need-an-effect';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
  // Ignore generated/output folders and archived references
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src-tauri/**',
      'tmp/tsc/**',
      'scripts/.tmp/**',
      'docs/reference/**',
      // wasm-bindgen output is generated code; linting it creates non-actionable warnings.
      'src/lib/wasm/generated/**',
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
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-you-might-not-need-an-effect': reactYouMightNotNeedAnEffectPlugin,
      import: importPlugin,
    },
    settings: {
      react: { version: 'detect' },
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
      // Flag undefined JSX components (e.g., missing imports)
      'react/jsx-no-undef': 'error',
      // Using the new JSX transform; no need for React in scope
      'react/react-in-jsx-scope': 'off',
      // Not using prop-types with TypeScript
      'react/prop-types': 'off',
      // React Hooks recommended
      ...reactHooksPlugin.configs.recommended.rules,
      // Enable "You Might Not Need an Effect" rules as warnings across the board for triage
      ...reactYouMightNotNeedAnEffectPlugin.configs.recommended.rules,
      'react-you-might-not-need-an-effect/no-empty-effect': 'warn',
      'react-you-might-not-need-an-effect/no-initialize-state': 'warn',
    },
  },
  // Apply unused-modules check only to app code and tests (not scripts/config)
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      'import/no-unused-modules': ['error', { unusedExports: true, missingExports: true, ignoreExports: ['src/main.tsx'] }],
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
