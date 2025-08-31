module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended'
  ],
  settings: {
    'import/resolver': {
      typescript: {}
    }
  },
  ignorePatterns: ['dist/', 'node_modules/', 'src-tauri/'],
  rules: {
    // Flag unused exports aggressively
    'import/no-unused-modules': ['error', { unusedExports: true, missingExports: true, ignoreExports: ['src/main.tsx'] }],
    // Defer unused var checks to TS-aware rule; allow underscore-prefixed
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    // Enforce no explicit any in general
    '@typescript-eslint/no-explicit-any': 'error',
    // Allow empty catch blocks (we intentionally swallow in many UI spots)
    'no-empty': ['error', { allowEmptyCatch: true }]
  },
  overrides: [
    { files: ['*.ts', '*.tsx'] }
  ]
}
