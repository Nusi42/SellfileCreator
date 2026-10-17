/**
 * Type surface of capture-fixtures.mjs for TS consumers (Playwright specs import
 * the .mjs directly; this declaration keeps editors/eslint typed without compiling
 * the script itself). Keep in sync with the runtime exports.
 */
export declare const CAPTURE_ARCHIVE_DIR: string
export declare const CAPTURE_UNPACK_DIR: string
/** The committed 2026-05-10 RSL Helper sample-log session (one push of every endpoint type). */
export declare const SAMPLE_LOG_SESSION: string
/** Replacement pairs for every playerId/playerName value found in `texts`, longest first. */
export declare function identityReplacements(texts: readonly string[]): Array<[string, string]>
/** Apply `identityReplacements` pairs to one text. */
export declare const anonymizeText: (text: string, pairs: ReadonlyArray<readonly [string, string]>) => string
/** Archive path for a session name (SSOT for the <name>.tar.zst convention). */
export declare const archivePathFor: (session: string) => string
/** Unpacked session dir for a session name. */
export declare const unpackedPathFor: (session: string) => string
/** Pack one capture session dir into tests/fixtures/captures/<session>.tar.zst. */
export declare function packCaptureSession(sessionDirOrName: string): Promise<string>
/** Ensure one committed capture session is unpacked; returns its unpacked dir. */
export declare function ensureCaptureSession(session: string): Promise<string>
/** All session names that have a committed archive. */
export declare const listArchivedSessions: () => string[]
