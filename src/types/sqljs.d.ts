/* eslint import/no-unused-modules: off */
declare module 'sql.js' {
  export interface SqlJsConfig {
    locateFile?: (file: string) => string
  }

  export interface Statement {
    step(): boolean
    getAsObject(params?: unknown[]): Record<string, unknown>
    free(): void
  }

  export interface Database {
    prepare(sql: string, params?: unknown[]): Statement
    close(): void
  }

  export interface SqlJsStatic {
    Database: {
      new(data?: Uint8Array): Database
    }
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>
}
export {}
