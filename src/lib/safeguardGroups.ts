/**
 * safeguardGroups.ts
 *
 * A safeguard GROUP is a contiguous run of ordinary rules that share one `group.id`. There is
 * no header entry and no nesting. Every member evaluates exactly as if ungrouped and its own
 * count sizes the gear it FEEDS the group; the group then merges those feeds into buckets keyed
 * by ITS scope chips, ranks the pool by the score each piece got from its own member, and keeps
 * ITS required count out of each bucket. The group's settings ride inline on every member (see
 * `SafeguardGroupSettings`), identical across the run.
 *
 * This module is the ONE place the app asks structural questions about groups. Two rules hold
 * it together:
 *
 *  1. **Run resolution lives in Rust.** Which entries form a run comes from
 *     `resolve_safeguard_groups` (wasm/rule_engine_core/src/safeguards/groups.rs) — the same code
 *     the detection scan and the native DLL's SFC reader use. There is deliberately no
 *     TypeScript re-implementation. Precedent: `getSafeguardCountKey`/`getSafeguardItemKey`
 *     ("Keep key derivation in wasm so JS cannot drift from detection semantics").
 *  2. **Nothing is re-derived at a call site.** Comparing neighbours' ids to decide membership
 *     outside this module is the same violation as duplicating a constant — import instead.
 *
 * The structural *edit* helpers below (group/ungroup/join/leave/move/re-id) are array
 * transforms in service of the UI. Rust never needs them, so they are not mirrored logic; each
 * one produces a new array that the normalizer then repairs.
 */
import {
  areSafeguardCountModesEqual,
  cloneSafeguardGroupSettings,
  cloneSafeguardRule,
  createSafeguardGroupId,
  isSafeguardGrouped,
  safeguardEntryKind,
  safeguardGroupIdOf,
  safeguardGroupSettingsEqual,
  withSafeguardGroup,
  type SafeguardGroupSettings,
  type SafeguardRule,
  type SafeguardRuleCountMode,
} from './safeguards'
import { resolveSafeguardGroupsWithLoadedWasm } from './wasm/wasmRuleEngine'
import type { SafeguardGroupEntryIn } from './wasm/generated/rust-types/SafeguardGroupEntryIn'
import type { SafeguardGroupsOut } from './wasm/generated/rust-types/SafeguardGroupsOut'

/** Re-exported so consumers type against the resolver's output without reaching into wasm/. */
export type SafeguardGroups = SafeguardGroupsOut

/** Sentinel `runStarts[i]` value for an ungrouped entry. */
export const SAFEGUARD_GROUP_NO_RUN = -1

// Minimal per-entry projection the Rust resolver consumes: the id and the divider flag.
const toGroupEntry = (rule: SafeguardRule): SafeguardGroupEntryIn => ({
  groupId: safeguardGroupIdOf(rule),
  separator: safeguardEntryKind(rule) === 'separator',
})

// One-slot memo keyed on the rules array identity. Every mutation path replaces the array
// (the store never mutates in place), so identity is a sound cache key and the resolver runs
// once per change rather than once per consumer per render.
let memoKey: readonly SafeguardRule[] | null = null
let memoValue: SafeguardGroups | null = null

/**
 * Resolves the group runs of a safeguard list. Index-aligned with `rules` throughout, so
 * consumers index the result exactly as they index the array.
 */
export const resolveSafeguardGroups = (rules: readonly SafeguardRule[]): SafeguardGroups => {
  // Array identity is stable between mutations, so repeat callers in one render share a result.
  if (memoKey === rules && memoValue !== null) return memoValue
  const resolved = resolveSafeguardGroupsWithLoadedWasm(rules.map(toGroupEntry))
  memoKey = rules
  memoValue = resolved
  return resolved
}

/** Half-open index range `[start, end)` of the run containing `index`, or null when ungrouped. */
export const safeguardGroupRunRange = (
  rules: readonly SafeguardRule[],
  index: number,
): { start: number; end: number } | null => {
  const groups = resolveSafeguardGroups(rules)
  const start = groups.runStarts[index] ?? SAFEGUARD_GROUP_NO_RUN
  if (start < 0) return null
  return { start, end: start + (groups.runLens[index] ?? 0) }
}

/** Every index of the run containing `index` (display order); just `[index]` when ungrouped. */
export const safeguardGroupRunIndices = (rules: readonly SafeguardRule[], index: number): number[] => {
  const range = safeguardGroupRunRange(rules, index)
  if (!range) return [index]
  return Array.from({ length: range.end - range.start }, (_, offset) => range.start + offset)
}

/** True when the list contains at least one group — the flat-list fast path for consumers. */
export const safeguardListHasGroups = (rules: readonly SafeguardRule[]): boolean => (
  resolveSafeguardGroups(rules).hasGroups
)

/**
 * The settings the run containing `index` actually runs with: those on the run's head, which is
 * the copy the engine reads. Null when ungrouped.
 */
export const safeguardGroupSettingsAt = (
  rules: readonly SafeguardRule[],
  index: number,
): SafeguardGroupSettings | null => {
  const range = safeguardGroupRunRange(rules, index)
  if (!range) return null
  return (rules[range.start] as SafeguardRule).group ?? null
}

// ── Normalization ───────────────────────────────────────────────────────────────────────

/**
 * Repairs the group structure of a list and writes the result back onto the entries.
 *
 * Three invariants, applied in this order:
 *  1. **An id names one run.** Two non-adjacent runs sharing an id (a paste, a drag that split
 *     a group in two) keep the id on the FIRST run and receive fresh ids after it — settings
 *     are cloned, never dropped, so both halves keep the promise the user made.
 *  2. **A run has at least two members.** A single-entry run is dissolved: a group of one is
 *     just a rule with an extra count, and leaving it grouped would show a group strip whose
 *     bracket brackets nothing.
 *  3. **Every member carries the same settings.** The canonical copy is the member whose
 *     settings changed relative to `previous` (the group strip edits one member's draft; the
 *     run must follow it) — found by object identity, since every mutation path replaces the
 *     edited entry. With no such member (a load, a paste, a plain move) the run's head wins,
 *     which is also what the engine reads.
 *
 * Called from exactly three places: the mutation funnel (`applySafeguardRulesChange`), the SFC
 * parse path, and the clipboard/append-import seam. Returns the input array unchanged (same
 * reference) when nothing needed repair, so it is safe to call unconditionally.
 */
export const normalizeSafeguardGroups = (
  rules: readonly SafeguardRule[],
  previous?: readonly SafeguardRule[],
): SafeguardRule[] => {
  // Nothing to repair on a list without any group at all — the overwhelmingly common case.
  if (!rules.some((rule) => isSafeguardGrouped(rule))) return rules as SafeguardRule[]
  const groups = resolveSafeguardGroups(rules)
  const previousSet = previous ? new Set<SafeguardRule>(previous) : null
  const next = rules.slice()
  let changed = false
  const seenIds = new Set<string>()
  const setEntry = (index: number, rule: SafeguardRule): void => {
    if (next[index] === rule) return
    next[index] = rule
    changed = true
  }
  for (let start = 0; start < rules.length; start += 1) {
    if ((groups.runStarts[start] ?? SAFEGUARD_GROUP_NO_RUN) !== start) continue
    const len = groups.runLens[start] ?? 0
    const end = start + len
    // (2) A run of one is not a group.
    if (len < 2) {
      setEntry(start, withSafeguardGroup(rules[start] as SafeguardRule, null))
      continue
    }
    const members = rules.slice(start, end)
    // (3) Canonical settings: the edited member if there is one, otherwise the head.
    const edited = previousSet
      ? members.find((member) => member.group !== undefined && !previousSet.has(member))
      : undefined
    const headSettings = (members[0] as SafeguardRule).group as SafeguardGroupSettings
    // Prefer the edited member only when it actually disagrees with the head — a freshly
    // inserted member that already carries the head's copy must not "win" spuriously.
    const source = edited && edited.group && !safeguardGroupSettingsEqual(edited.group, headSettings)
      ? edited.group
      : headSettings
    // (1) A repeated id after a gap gets a fresh one; the settings travel with the new id.
    const id = seenIds.has(source.id) ? createSafeguardGroupId() : source.id
    seenIds.add(id)
    const canonical: SafeguardGroupSettings = { ...cloneSafeguardGroupSettings(source), id }
    for (let index = start; index < end; index += 1) {
      setEntry(index, withSafeguardGroup(rules[index] as SafeguardRule, canonical))
    }
  }
  // Preserve array identity when nothing moved — downstream memos key on it.
  return changed ? next : (rules as SafeguardRule[])
}

// ── Structural edits ────────────────────────────────────────────────────────────────────
// Pure array transforms. Each returns a NEW array (and runs the normalizer where the result
// can violate an invariant), so callers never reason about contiguity themselves. Every group
// entry point (context menu, keyboard, drag & drop, the builder strip) funnels through these.

// Scope chips shared by every member — the neutral seed for a new group's buckets.
const intersectCountModes = (modes: readonly SafeguardRuleCountMode[]): SafeguardRuleCountMode => {
  const all = (key: keyof SafeguardRuleCountMode) => modes.every((mode) => mode[key])
  const perSet = all('perSet')
  const perFaction = all('perFaction')
  const perMainStat = all('perMainStat')
  const perSlot = all('perSlot')
  // perRule is the "no chip" fallback: on iff no chip survived the intersection.
  return { perRule: !(perSet || perFaction || perMainStat || perSlot), perSet, perFaction, perMainStat, perSlot }
}

/**
 * Turns the selected rules into a new group.
 *
 * The selection is gathered (in its existing relative order) at the position of its topmost
 * member — grouping is "block moved together + joined", the same thing a drop inside a bracket
 * does. The seed count is the MINIMUM of the members' counts — the tightest promise any of them
 * already made — and the chips are the ones every member already shares.
 * Members already in another group are pulled out of it (their old run is repaired by the
 * normalizer). Separators are never grouped.
 *
 * Returns the new array plus the indices of the group so the caller can select it.
 */
export const groupSafeguardSelection = (
  rules: readonly SafeguardRule[],
  selection: readonly number[],
): { rules: SafeguardRule[]; groupIndices: number[] } | null => {
  const ordered = Array.from(new Set(selection))
    .filter((index) => index >= 0 && index < rules.length)
    .filter((index) => safeguardEntryKind(rules[index] as SafeguardRule) === 'rule')
    .sort((a, b) => a - b)
  // A group needs two members; the normalizer would dissolve anything smaller.
  if (ordered.length < 2) return null
  const claimed = new Set(ordered)
  const members = ordered.map((index) => rules[index] as SafeguardRule)
  const settings: SafeguardGroupSettings = {
    id: createSafeguardGroupId(),
    requiredCount: members.reduce((min, rule) => Math.min(min, Math.max(1, rule.requiredCount)), Number.POSITIVE_INFINITY),
    countMode: intersectCountModes(members.map((rule) => rule.countMode)),
  }
  const block = members.map((rule) => withSafeguardGroup(cloneSafeguardRule(rule), settings))
  const insertAt = ordered[0] as number
  // Everything not selected keeps its place, with the block lifted out of the middle.
  const remaining = rules.filter((_, index) => !claimed.has(index))
  const before = remaining.slice(0, insertAt)
  const after = remaining.slice(insertAt)
  const next = normalizeSafeguardGroups([...before, ...block, ...after])
  return {
    rules: next,
    groupIndices: block.map((_, offset) => insertAt + offset),
  }
}

/** Dissolves the whole run containing `index`; every member keeps its own count and settings. */
export const ungroupSafeguardRun = (rules: readonly SafeguardRule[], index: number): SafeguardRule[] | null => {
  const range = safeguardGroupRunRange(rules, index)
  if (!range) return null
  return rules.map((rule, cursor) => (
    cursor >= range.start && cursor < range.end ? withSafeguardGroup(rule, null) : rule
  ))
}

/** Removes ONE member from its run. A run left with a single member is dissolved by the normalizer. */
export const removeSafeguardFromGroup = (rules: readonly SafeguardRule[], index: number): SafeguardRule[] | null => {
  const rule = rules[index]
  if (!rule || !isSafeguardGrouped(rule)) return null
  return normalizeSafeguardGroups(rules.map((entry, cursor) => (
    cursor === index ? withSafeguardGroup(entry, null) : entry
  )))
}

/**
 * Rebases an edited draft onto the rule it replaces, keeping the STORED membership while letting
 * the draft's group SETTINGS through.
 *
 * The two halves of `group` have different owners. **Membership** (is there a group, and which
 * one — the `id`) is structure: it is edited through the chip list (group / leave / join / drag),
 * never through the builder form. **Settings** (`requiredCount`, `countMode`) are edited from the
 * builder's group strip and must commit on Apply like any other field.
 *
 * The draft only snapshots `group` when a rule is loaded and nothing resyncs it afterwards, so a
 * plain write-back would undo a membership edit made while that draft sat open. Dropping the
 * draft's `group` wholesale would fix that but throw away the strip's edit with it — hence the
 * split: the stored side decides *whether* and *which*, the draft side decides *what it promises*.
 * Every "replace rule N with the draft" seam goes through here, so the builder can never resurrect
 * a group the user just left nor strip one they just joined, and the strip still works.
 */
export const withStoredSafeguardMembership = (draft: SafeguardRule, stored: SafeguardRule): SafeguardRule => {
  const storedGroup = stored.group
  // Not a member any more (or never was): the draft's stale settings have nothing to attach to.
  if (!storedGroup) return withSafeguardGroup(draft, null)
  // A member: keep the stored id — the draft may name a group the rule has since left or joined —
  // and take the settings from the draft, which is where the group strip wrote them. A draft with
  // no group of its own (it was ungrouped when loaded) simply keeps what the store already has.
  const settings = draft.group ?? storedGroup
  return withSafeguardGroup(draft, { ...cloneSafeguardGroupSettings(settings), id: storedGroup.id })
}

// The settings `index` would adopt by joining the run on `side`, or null when there is no such
// run or the entry is already in it. ONE definition of "can this entry join", so the menu's
// enablement and the mutation can never disagree about which entries offer the action — and the
// predicate answers without building an array (see `canJoinSafeguardAdjacentGroup`).
const joinableSafeguardGroupSettings = (
  rules: readonly SafeguardRule[],
  index: number,
  side: 'above' | 'below',
): SafeguardGroupSettings | null => {
  const rule = rules[index]
  if (!rule || safeguardEntryKind(rule) !== 'rule') return null
  const neighbour = side === 'above' ? index - 1 : index + 1
  const settings = safeguardGroupSettingsAt(rules, neighbour)
  if (!settings) return null
  // Already a member of that very run — joining would be a no-op.
  if (safeguardGroupIdOf(rule) === settings.id) return null
  return settings
}

/**
 * Makes `index` a member of the run adjacent to it (`above` = the run ending right before it,
 * `below` = the run starting right after it), adopting that run's settings. Returns null when
 * there is no such run or the entry already belongs to it.
 */
export const joinSafeguardAdjacentGroup = (
  rules: readonly SafeguardRule[],
  index: number,
  side: 'above' | 'below',
): SafeguardRule[] | null => {
  const settings = joinableSafeguardGroupSettings(rules, index, side)
  if (!settings) return null
  return normalizeSafeguardGroups(rules.map((entry, cursor) => (
    cursor === index ? withSafeguardGroup(entry, settings) : entry
  )))
}

/**
 * Whether `joinSafeguardAdjacentGroup` would do anything — for menu enablement. Shares the
 * precondition helper rather than calling the mutation and testing for null: this runs on every
 * render while the chip context menu is open, and the mutation would map the whole rules array
 * and re-run the wasm group resolver just to have the result thrown away.
 */
export const canJoinSafeguardAdjacentGroup = (
  rules: readonly SafeguardRule[],
  index: number,
  side: 'above' | 'below',
): boolean => joinableSafeguardGroupSettings(rules, index, side) !== null

// NOTE: there is deliberately no "write these settings across the run" helper. The group strip
// edits ONE member and the normalizer fans that edit out to its run (invariant 3 in
// `normalizeSafeguardGroups`, which spots the edited member by identity), so a second, manual
// fan-out path would be a way for the two to disagree rather than a convenience.

// ── Moves ───────────────────────────────────────────────────────────────────────────────

// The list seen as top-level UNITS: an ungrouped entry is a unit of one, a run is one unit.
// Directional moves step over units, which is what keeps a run together and keeps an outsider
// from landing inside it.
const resolveUnits = (rules: readonly SafeguardRule[]): Array<{ start: number; end: number }> => {
  const groups = resolveSafeguardGroups(rules)
  const units: Array<{ start: number; end: number }> = []
  let cursor = 0
  while (cursor < rules.length) {
    const len = Math.max(1, groups.runLens[cursor] ?? 0)
    units.push({ start: cursor, end: cursor + len })
    cursor += len
  }
  return units
}

/**
 * Group-aware implementation of the four directional move actions.
 *
 * Supplied to `useItemListManager.resolveDirectionalMove`, so the inline ↑/↓ buttons, the
 * context-menu Move entries and the keyboard shortcuts all agree. The one rule: **a position
 * move never changes membership** — only join/leave/drag-into-bracket do.
 *
 *  - A selection that lies entirely INSIDE one run (and is not the whole run) moves within that
 *    run; at the run's edge it stops (null), because leaving is an explicit action.
 *  - Otherwise the selection is widened to whole units (a partially selected run is taken
 *    along in full) and the block steps over the neighbouring unit — an ungrouped entry hops a
 *    whole run rather than landing inside it, and a run moves as one block.
 *
 * Returns null when the move would change nothing.
 */
export const resolveSafeguardDirectionalMove = (
  rules: readonly SafeguardRule[],
  movingIndices: readonly number[],
  direction: 'up' | 'down' | 'top' | 'bottom',
): SafeguardRule[] | null => {
  const ordered = Array.from(new Set(movingIndices))
    .filter((index) => index >= 0 && index < rules.length)
    .sort((a, b) => a - b)
  if (ordered.length === 0) return null
  const first = ordered[0] as number
  const last = ordered[ordered.length - 1] as number
  const range = safeguardGroupRunRange(rules, first)
  const insideOneRun = range !== null
    && last < range.end
    && !(first === range.start && ordered.length === range.end - range.start)
  if (insideOneRun) {
    // Move within the run: one slot at a time, or to the run's own edge.
    const target = (() => {
      switch (direction) {
        case 'up': return first <= range.start ? null : first - 1
        case 'down': return last + 1 >= range.end ? null : last + 2
        case 'top': return first === range.start ? null : range.start
        case 'bottom': return last + 1 >= range.end ? null : range.end
        default: return null
      }
    })()
    if (target === null) return null
    return spliceEntries(rules, ordered, target)
  }
  // Widen to whole units so a run never tears.
  const units = resolveUnits(rules)
  const claimedUnits = units.filter((unit) => ordered.some((index) => index >= unit.start && index < unit.end))
  const claimed = claimedUnits.flatMap((unit) => Array.from({ length: unit.end - unit.start }, (_, offset) => unit.start + offset))
  const firstUnit = claimedUnits[0] as { start: number; end: number }
  const lastUnit = claimedUnits[claimedUnits.length - 1] as { start: number; end: number }
  const target = (() => {
    switch (direction) {
      case 'up': {
        const previous = units.filter((unit) => unit.end <= firstUnit.start).pop()
        return previous ? previous.start : null
      }
      case 'down': {
        const following = units.find((unit) => unit.start >= lastUnit.end)
        return following ? following.end : null
      }
      case 'top': return firstUnit.start === 0 ? null : 0
      case 'bottom': return lastUnit.end >= rules.length ? null : rules.length
      default: return null
    }
  })()
  if (target === null) return null
  return spliceEntries(rules, claimed, target)
}

// Moves the given indices (in order) to `targetIndex` in pre-move index space. Membership is
// untouched; the normalizer then repairs whatever the new adjacency implies (a member moved
// away from its run becomes a run of one and is dissolved; a run moved as a block survives).
const spliceEntries = (
  rules: readonly SafeguardRule[],
  ordered: readonly number[],
  targetIndex: number,
): SafeguardRule[] => {
  const claimed = new Set(ordered)
  const block = ordered.map((index) => rules[index] as SafeguardRule)
  const removedBefore = ordered.filter((index) => index < targetIndex).length
  const remaining = rules.filter((_, index) => !claimed.has(index))
  const insertAt = Math.max(0, Math.min(targetIndex - removedBefore, remaining.length))
  return normalizeSafeguardGroups([
    ...remaining.slice(0, insertAt),
    ...block,
    ...remaining.slice(insertAt),
  ])
}

/**
 * The membership a drop at `insertIndex` can offer, for the drag layer:
 *  - `forced` — the point lies strictly inside a run, so whatever lands there joins it;
 *  - `optional` — a run ends right above or starts right below the point, so the pointer's
 *    horizontal position decides (indented = join, flush = stay outside); the run above wins
 *    when both touch the point;
 *  - `none` — no run touches the point.
 * Returns the settings of the run that would be joined so the guide can take its colour.
 */
export const resolveSafeguardDropMembership = (
  rules: readonly SafeguardRule[],
  insertIndex: number,
): { kind: 'forced' | 'optional' | 'none'; settings: SafeguardGroupSettings | null } => {
  const above = insertIndex - 1
  const below = insertIndex
  const aboveRange = above >= 0 ? safeguardGroupRunRange(rules, above) : null
  const belowRange = below < rules.length ? safeguardGroupRunRange(rules, below) : null
  // Strictly inside a run: the entry above and the entry below share the run.
  if (aboveRange && belowRange && aboveRange.start === belowRange.start) {
    return { kind: 'forced', settings: safeguardGroupSettingsAt(rules, above) }
  }
  if (aboveRange) return { kind: 'optional', settings: safeguardGroupSettingsAt(rules, above) }
  if (belowRange) return { kind: 'optional', settings: safeguardGroupSettingsAt(rules, below) }
  return { kind: 'none', settings: null }
}

/**
 * Applies a drop that carries a membership decision. This is the shared implementation behind
 * drag & drop (move and Ctrl-copy alike): the moved/copied entries land at `targetIndex` and
 * ALL of them join the run named by `settings`, or — flush drop, `settings === null` — leave
 * whatever run they were in. The one exception to "leave" is a run dragged IN FULL: it was not
 * torn from anything, so it travels intact (a flush drop of a whole group moves the group;
 * a Ctrl-copy of a whole group makes a second group under a fresh id).
 *
 * Returns the new array and the indices the moved/copied entries occupy in it.
 */
export const moveSafeguardEntriesForDrop = (
  rules: readonly SafeguardRule[],
  movingIndices: readonly number[],
  targetIndex: number,
  settings: SafeguardGroupSettings | null,
  mode: 'move' | 'copy',
): { next: SafeguardRule[]; newIndices: number[] } | null => {
  const ordered = Array.from(new Set(movingIndices))
    .filter((index) => index >= 0 && index < rules.length)
    .sort((a, b) => a - b)
  if (ordered.length === 0) return null
  // Runs the drag takes along IN FULL keep their membership on a flush drop; anything else
  // leaves. Computed once so move and copy agree.
  const claimedSet = new Set(ordered)
  const travelsIntact = (index: number): boolean => {
    const range = safeguardGroupRunRange(rules, index)
    if (!range) return false
    for (let cursor = range.start; cursor < range.end; cursor += 1) {
      if (!claimedSet.has(cursor)) return false
    }
    return true
  }
  // Only rules can join a group; a dragged separator stays a divider wherever it lands.
  const project = (rule: SafeguardRule, index: number): SafeguardRule => {
    if (safeguardEntryKind(rule) !== 'rule') return rule
    if (settings === null && travelsIntact(index)) return rule
    return withSafeguardGroup(rule, settings)
  }
  const clampedTarget = Math.max(0, Math.min(rules.length, targetIndex))
  if (mode === 'copy') {
    // Copies always get fresh ids for any run they carry whole, so a duplicated group does not
    // merge into its source; a drop into a bracket overrides that with the target's settings.
    const copies = ordered.map((index) => cloneSafeguardRule(rules[index] as SafeguardRule))
    const block = settings === null
      ? remapSafeguardGroupIds(rules, ordered, copies.map((copy, offset) => project(copy, ordered[offset] as number)))
      : copies.map((copy, offset) => project(copy, ordered[offset] as number))
    const next = normalizeSafeguardGroups([...rules.slice(0, clampedTarget), ...block, ...rules.slice(clampedTarget)])
    return { next, newIndices: block.map((_, offset) => clampedTarget + offset) }
  }
  const block = ordered.map((index) => project(rules[index] as SafeguardRule, index))
  const removedBefore = ordered.filter((index) => index < clampedTarget).length
  const remaining = rules.filter((_, index) => !claimedSet.has(index))
  const insertAt = Math.max(0, Math.min(clampedTarget - removedBefore, remaining.length))
  const raw = [...remaining.slice(0, insertAt), ...block, ...remaining.slice(insertAt)]
  const next = normalizeSafeguardGroups(raw)
  return { next, newIndices: block.map((_, offset) => insertAt + offset) }
}

/**
 * Re-ids the groups carried by a batch of copies so they never merge into their sources.
 *
 * `sourceIndices` are the entries the copies were made from (same order). A run that is copied
 * IN FULL becomes a new group under a fresh id (one id per source run, so the copies stay
 * together); a run copied only PARTIALLY keeps its id, so a duplicated member stays a member
 * when it lands beside its siblings — and dissolves harmlessly when it lands elsewhere.
 * Copies without a source (a paste from the clipboard) are treated as full runs of whatever
 * ids they carry.
 */
export const remapSafeguardGroupIds = (
  source: readonly SafeguardRule[],
  sourceIndices: readonly number[] | null,
  copies: readonly SafeguardRule[],
): SafeguardRule[] => {
  // Which source runs are fully covered by the copied indices.
  const fullyCopied = new Set<string>()
  if (sourceIndices) {
    const copied = new Set(sourceIndices)
    for (const index of sourceIndices) {
      const range = safeguardGroupRunRange(source, index)
      if (!range) continue
      const id = safeguardGroupIdOf(source[index] as SafeguardRule)
      if (id === null) continue
      let complete = true
      for (let cursor = range.start; cursor < range.end; cursor += 1) {
        if (!copied.has(cursor)) { complete = false; break }
      }
      if (complete) fullyCopied.add(id)
    }
  }
  const fresh = new Map<string, string>()
  return copies.map((rule) => {
    const id = safeguardGroupIdOf(rule)
    if (id === null) return rule
    // Partial copies keep their id (only when we know the source at all).
    if (sourceIndices && !fullyCopied.has(id)) return rule
    let replacement = fresh.get(id)
    if (!replacement) {
      replacement = createSafeguardGroupId()
      fresh.set(id, replacement)
    }
    return withSafeguardGroup(rule, { ...(rule.group as SafeguardGroupSettings), id: replacement })
  })
}

// Kept for callers that only need to compare chips (re-exported through the facade so
// consumers do not import scope helpers from two modules).
export { areSafeguardCountModesEqual }
