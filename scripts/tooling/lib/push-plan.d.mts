/**
 * Type surface of push-plan.mjs for TS consumers (unit tests). Keep in sync with the
 * runtime exports.
 */
export type CheckoutRole = 'master' | 'work' | 'plain'
export interface PushRef {
  localRef: string
  localSha: string
  remoteRef: string
  remoteSha: string
}
export interface PushStep {
  id: string
  title: string
  /** `node` runs a script of the hook's checkout; `npm` an npm script. */
  tool: 'node' | 'npm'
  args: readonly string[]
  /** Gets git's ref lines on stdin. */
  stdin: boolean
}
export type PushPlan = { steps: PushStep[] } | { refusal: string }
export declare const PUBLIC_REMOTE: string
export declare const PUBLISH_BRANCH: string
export declare function publishCommand(master: string): string
export declare function isLocalUrl(url: string): boolean
export declare function localPath(root: string, url: string): string
export declare function masterOf(root: string): string | undefined
export declare function checkoutRole(root: string): CheckoutRole
export declare function parsePushLines(text: string): PushRef[]
export declare function hasCommit(root: string, sha: string): boolean
export declare function pushedRange(ref: PushRef, known: (sha: string) => boolean): string[] | undefined
export declare function pushedMerges(root: string, ref: PushRef): string[]
export declare function isReleaseTagRef(ref: string): boolean
export declare function pushPlan(push: { role: CheckoutRole; url: string; refs: readonly PushRef[]; master?: string | undefined }): PushPlan
