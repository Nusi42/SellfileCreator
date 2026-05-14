// Minimal legacy config required by eslint-plugin-import's no-unused-modules rule
// when using flat config. See https://github.com/import-js/eslint-plugin-import/issues/3079
// All actual configuration lives in eslint.config.js.
module.exports = {
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'src-tauri/',
    'tmp/tsc/',
    'scripts/.tmp/',
    'docs/reference/',
    'src/lib/wasm/generated/',
    'wasm/target/',
    'wasm/rule_engine_core/bindings/',
    'wasm/rule_engine_wasm/bindings/',
  ],
}
