/**
 * Type surface of commit-message.mjs for TS consumers (unit tests). Keep in sync with
 * the runtime exports.
 */
export declare const COMMIT_TYPES: readonly string[]
export declare const SUBJECT_MAX_LENGTH: number
export declare const FORBIDDEN_PHRASES: ReadonlyArray<{ re: RegExp; why: string }>
/** The message as git records it: comments and everything after a scissors line removed. */
export declare function messageText(raw: string): string
/** Every rule violation of one commit message, as readable strings. */
export declare function commitMessageProblems(message: string): string[]
