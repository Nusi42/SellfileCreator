/**
 * Type surface of capture-fixtures.mjs for TS consumers (Playwright specs import
 * the .mjs directly; this declaration keeps editors/eslint typed without compiling
 * the script itself). Keep in sync with the runtime exports.
 */
export declare const CAPTURE_ARCHIVE_DIR: string
export declare const CAPTURE_UNPACK_DIR: string
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
