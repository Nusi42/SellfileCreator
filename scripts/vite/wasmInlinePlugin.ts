import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);

const WASM_INLINE_SUFFIX = '.wasm?inline';
const INLINE_QUERY = '?inline';
const SQLJS_WASM_ID = 'sql.js/dist/sql-wasm.wasm';
// Path to the main rule-engine WASM, resolved relative to this plugin file at build time.
// Two levels up from scripts/vite/ → repo root, then into src/lib/wasm/generated/.
const RULE_ENGINE_WASM_ID = new NodeURL('../../src/lib/wasm/generated/rule_engine_bg.wasm', import.meta.url);

const normalizePath = (id: string): string => {
  const withoutQuery = id.slice(0, -INLINE_QUERY.length);
  if (withoutQuery.startsWith('file://')) {
    return fileURLToPath(withoutQuery);
  }
  return withoutQuery;
};

const dataUriCache = new Map<string, string>();

const encodeFileAsDataUri = (filePath: string): string => {
  const cached = dataUriCache.get(filePath);
  if (cached) return cached;
  const contents = readFileSync(filePath);
  const dataUri = `data:application/wasm;base64,${contents.toString('base64')}`;
  dataUriCache.set(filePath, dataUri);
  return dataUri;
};

const resolveSqlJsWasmPath = (): string | null => {
  try {
    return require.resolve(SQLJS_WASM_ID);
  } catch {
    return null;
  }
};

export function wasmInlinePlugin(): Plugin {
  const resolvedSqlJsWasmPath = resolveSqlJsWasmPath();
  const sqlJsInlineDataUri = resolvedSqlJsWasmPath ? encodeFileAsDataUri(resolvedSqlJsWasmPath) : null;
  // Read the rule-engine WASM at build time so we can inject it as a define constant.
  // This mirrors the sql.js pattern and avoids any ?inline module-import complications.
  const ruleEngineInlineDataUri = encodeFileAsDataUri(fileURLToPath(RULE_ENGINE_WASM_ID));

  return {
    name: 'wasm-inline-data-uri',
    enforce: 'pre',
    config() {
      const defineEntries: Record<string, string> = {
        // __RULE_ENGINE_WASM_INLINE__: consumed by wasmRuleEngine.ts to load the WASM
        // without triggering new URL(…) asset inlining in every bundle that imports it.
        __RULE_ENGINE_WASM_INLINE__: JSON.stringify(ruleEngineInlineDataUri),
      };
      if (sqlJsInlineDataUri) {
        defineEntries.__SQL_JS_WASM_INLINE__ = JSON.stringify(sqlJsInlineDataUri);
      }
      return { define: defineEntries };
    },
    load(id) {
      if (!id.endsWith(WASM_INLINE_SUFFIX)) return null;
      const filePath = normalizePath(id);
      const dataUri = encodeFileAsDataUri(filePath);
      return `export default ${JSON.stringify(dataUri)};`;
    },
  };
}
