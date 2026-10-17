/**
 * Type surface of private-patterns.mjs for TS consumers (unit tests). Keep in sync with
 * the runtime exports.
 */
export interface Matcher {
  regex: RegExp
  /** 1-based line of the patterns file the matcher comes from. */
  line: number
  /** A pattern of the file, or the base64 form of a literal one. */
  kind: 'pattern' | 'base64'
}
export interface Finding {
  line: number
  column: number
  /** The matched text, masked (first character + asterisks). */
  masked: string
  matcher: Matcher
}
export declare const PATTERNS_ENV: string
export declare const MIN_ENCODED_LENGTH: number
export declare const patternsPath: (env?: Record<string, string | undefined>) => string
export declare function loadMatchers(file: string): Matcher[] | undefined
export declare function matchersFrom(text: string): Matcher[]
export declare function literalOf(source: string): string | undefined
export declare function base64Forms(literal: string): string[]
export declare function scanText(text: string, matchers: readonly Matcher[]): Finding[]
export declare const mask: (text: string) => string
export declare function maskAll(text: string, matchers: readonly Matcher[]): string
export declare function describe(where: string, finding: Finding): string
export declare const PUSH_LOG_FORMAT: string
export declare function pushSections(log: string): Array<{ where: string; text: string }>
