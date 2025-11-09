import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);

const WASM_INLINE_SUFFIX = '.wasm?inline';
const INLINE_QUERY = '?inline';
const SQLJS_WASM_ID = 'sql.js/dist/sql-wasm.wasm';

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
  const inlineDataUri = resolvedSqlJsWasmPath ? encodeFileAsDataUri(resolvedSqlJsWasmPath) : null;

  return {
    name: 'wasm-inline-data-uri',
    enforce: 'pre',
    config() {
      if (!inlineDataUri) return undefined;
      return {
        define: {
          __SQL_JS_WASM_INLINE__: JSON.stringify(inlineDataUri),
        },
      };
    },
    load(id) {
      if (!id.endsWith(WASM_INLINE_SUFFIX)) return null;
      const filePath = normalizePath(id);
      const dataUri = encodeFileAsDataUri(filePath);
      return `export default ${JSON.stringify(dataUri)};`;
    },
  };
}
