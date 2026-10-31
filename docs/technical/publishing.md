# Publishing and Git History

Decision record (2026-10-31): which checkout publishes to the public repository, what each push checks, and how branches are combined. Placeholders: `<master>` is the publishing checkout, `<branch>` a work folder's branch; their concrete paths live in the untracked `CLAUDE.local.md`.

## Context

The maintainer keeps one checkout as the **master** (branch `main`; release builds and release commits happen there) and does the day-to-day work in **work folders**: clones whose `origin` is the master's local path, each on its own branch. A plain clone (a contributor's, or a checkout on another machine) has no master. There is no hosted CI, so the git hooks are the gate.

Before this decision every pre-push ran the full local check (`npm run check`) for every remote, any checkout could push anywhere, and branches reached `main` through merge commits as well as fast-forwards.

## Decision

### Only the master publishes

- The master is marked once with `node scripts/tooling/mark-master.mjs`: it records `sfc.checkoutRole = master` in the checkout's local git config and points `core.hooksPath` at `.githooks/`, so its hooks always run (`scripts/tooling/lib/checkout-role.mjs`).
- The master is the only checkout with the public remote `github`, and it pushes only `main` and release tags `v<semver>`: `git -C <master> push github main` (or `npm run release:publish` there, which pushes `main` with the release tag).
- Work folders push only to the master (a local path): `git push origin <branch>`, then `git -C <master> merge --ff-only <branch>`.
- A remote is **local** when its URL is a path (`C:\…`, `/…`, `../x`, `\\host\share`, `file://…`) and a **network** remote otherwise.

What the pre-push hook runs is decided in one function, `pushPlan({ role, url, refs })` in `scripts/tooling/lib/push-plan.mjs`; `scripts/tooling/pre-push.mjs` runs it on load (never behind a "main module" test, so a broken wiring cannot pass silently):

| Pushing checkout | Remote | Runs |
| ---- | ---- | ---- |
| work folder | local path (the master) | private-data guard on the pushed commits, no merge commits, `npm run check` |
| work folder | network | refused; the message names `git -C <master> push github main` |
| master | network, only `main` → `main` and `v<semver>` tags | private-data guard on the pushed commits and on every tracked file, no merge commits, dependency licenses (nothing is built) |
| master | local path, or any other ref | refused |
| plain clone | any | private-data guard on the pushed commits, no merge commits, `npm run check` |

`main` only moves to a commit that passed the full check on its way into the master (and a release passes `npm run test:all` in `release:win`), so the master's publishing push does not repeat it.

### Rebase, never merge

Branches are combined by rebasing onto the target and fast-forwarding, never with a merge commit, so `main` stays a straight line (the public repository's ruleset requires linear history):

```text
git switch -C integrate <branch>   # in the checkout that combines the work
git rebase main
git switch main && git merge --ff-only integrate
```

`scripts/tooling/check-linear.mjs` refuses merge commits in what a push adds (commits on no remote-tracking branch and not under the remote's old value, `pushedRange` in `push-plan.mjs`) on pushes to and from the master and from plain clones. The merge commits already in the history stay; the history is not rewritten for this, and `npm run check:commit-msg` still accepts their `Merge <what it brought>` subjects.

### Hook details

- The hooks call the scripts of their own checkout (`"$(dirname "$0")/../scripts/tooling/…"`), so they also work when `core.hooksPath` is an absolute path (the hook tests rely on it).
- The pre-commit guard refuses originSessionId lines (the session key Claude Code writes into memory-note front matter), also when indented under `metadata`. The project keeps no agent memory notes in the repository, so there is no Claude Code post-edit hook to strip that key and its siblings `modified` / `node_type`.
- Docs and rule texts name `Claude-Session` and `originSessionId` without a trailing colon, and the tests assemble them from parts, so a history scan for real trailers and front-matter lines finds only real ones.
- Fixture tests (`tests/integration/*.runner.ts`, the SFC fixture and matcher harnesses) are part of `npm run test:unit` and therefore of the full check before a push.

Tests: `tests/unit/push-plan.test.ts` (every role / URL / ref combination, roles from git config, the pushed range) and `tests/unit/git-hooks.test.ts` (the real hooks run by git in throw-away repositories with synthetic private patterns: a staged private value fails the commit, a private or merge commit never reaches the master, a work folder's network push and the master's local or non-`main` pushes are refused, the master's publishing push runs exactly the build-free checks, and `mark-master.mjs` sets `core.hooksPath`).

### Public repository settings

Set by hand on GitHub, never by a script: private vulnerability reporting on (the route `SECURITY.md` describes), secret scanning with push protection on, Dependabot alerts on, Actions off (there is no hosted CI; the hooks are the gate), pull requests squash-merged only, a ruleset on `main` that blocks deletion and force pushes and requires linear history (the maintainer may bypass it), and a ruleset that keeps `v*` release tags from being moved or deleted.

## Alternatives

- **Publish from the lead work folder** (the remote `github` there, full check on that push): rejected. The published `main` would come from a checkout that also holds unfinished work, and the master's `main` could lag behind or diverge from the public one.
- **Run the full check on the master's publishing push too**: rejected. It would rebuild what already passed on the way in, and it would block publishing on machine state (WASM toolchain, a dirty build tree) unrelated to what is pushed.
- **Allow merge commits and squash on GitHub**: not applicable; the master pushes `main` directly, so only a linear local history keeps the public `main` linear.
- **Role marker in `.env.local`**: rejected in favour of local git config, which needs no parser, cannot be committed by accident and stays with the repository's `.git`.

## Consequences

- A new master needs `node scripts/tooling/mark-master.mjs` once; `npm install` alone only installs the hooks.
- A work folder can no longer push to a network remote, and nothing but the master's `main` and release tags reach the public repository.
- Combining branches needs a rebase; a merge commit is caught at the next push to or from the master.
