/**
 * Type surface of checkout-role.mjs for TS consumers (unit tests). Keep in sync with the
 * runtime exports.
 */
export declare const HOOKS_PATH: string
export declare const ROLE_KEY: string
export declare const MASTER_ROLE: string
export declare function withoutRepoEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv
export declare function gitIn(dir: string, args: readonly string[]): string | undefined
export declare function isMaster(dir: string): boolean
export declare function originOf(dir: string): string | undefined
export declare function installHooks(dir: string): boolean
export declare function markMaster(dir: string): void
