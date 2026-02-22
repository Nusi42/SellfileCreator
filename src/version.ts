// Centralized app version, injected from package.json by Vite define
// During build, __APP_VERSION__ is replaced with the package.json version.
declare const __APP_VERSION__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';
/**
 * version.ts
 *
 * Single source of truth for the app Version string used in SFR exports.
 */
