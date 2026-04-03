# Gear Inspector Rule Templates

This document describes the Gear Inspector gear actions (UX) and the default
recipes that are generated for "Add Keep Recipe" and "Add Sell Recipe".

## UX Spec

- Entry point: each Gear Inspector card can show a compact gear button in the
  top-right corner. The button is hidden by default and enabled via the
  Gear Inspector grid context menu. Tooltip: "Add a keep or sell recipe based on this item."
- Click behavior: opens a small menu with two actions:
  - Add Keep Rule
  - Add Sell Rule
- Result: the new recipe is inserted after the currently selected recipe
  (or appended when no recipe is selected) and the builder selection jumps
  to the new recipe so users can fine-tune it immediately.
- Availability: the gear action appears only in the main Gear Inspector grid
  (not in the Safeguards tab).

## Generated Recipe Defaults

Every template is built from the clicked item and applies the same anchors:

- Slot: the item slot is always selected.
- Set: the item's set is selected when known and valid.
- Rank + rarity: exact rank and exact rarity are locked in.
- Level window: ranges are bucketed to match the item level.
- Main stat: selected when the slot has a variable main stat.
- Substats: use the item's current substats (deduped).

The actions then diverge:

- Keep rule:
  - Fixed substats: top 1/2/3 substats (by roll count, then stat priority)
    depending on level bracket.
  - Min rolls (per stat): optional floors based on the current roll count.
  - Min count: set to the number of fixed substats; auto min-count is off.
- Sell rule:
  - Fixed substats: all substats from the item.
  - Max rolls (per stat): capped at the current roll count, so higher quality
    rolls do not match the sell rule.
  - Min count: set to the full substat count; auto min-count is off.

## Level Brackets

Level brackets are derived from the item level to keep templates reasonable:

- 0-8: early
- 9-12: mid
- 13-16: late

Keep templates always start at level 0 and round the max up to the next
milestone (0/4/8/12/16). Sell templates clamp to the current milestone bucket
by setting `minLevel` and `maxLevel` to the rounded-down milestone.

## Rule Template Examples

These examples show the shape of the templates. The actual stat picks come
from the clicked item.

### Keep rule (0-8)

- Fixed substats: 1 (top rolled or highest-priority stat)
- Min rolls: 1 roll if the stat has any rolls
- Level range: 0 to next milestone (0/4/8)
- Slot + set + rank + rarity + main stat anchored

### Keep rule (9-12)

- Fixed substats: 2
- Min rolls: cap at 2 rolls based on current rolls
- Level range: 0 to next milestone (8/12)
- Slot + set + rank + rarity + main stat anchored

### Keep rule (13-16)

- Fixed substats: 3
- Min rolls: full current roll counts
- Level range: 0 to next milestone (12/16)
- Slot + set + rank + rarity + main stat anchored

### Sell rule (0-8)

- Fixed substats: all substats on the item
- Max rolls: cap at the current roll count (including zero-roll stats)
- Level range: minLevel=maxLevel (0/4/8)
- Slot + set + rank + rarity + main stat anchored

### Sell rule (9-12)

- Fixed substats: all substats on the item
- Max rolls: cap at the current roll count
- Level range: minLevel=maxLevel (8/12)
- Slot + set + rank + rarity + main stat anchored

### Sell rule (13-16)

- Fixed substats: all substats on the item
- Max rolls: cap at the current roll count
- Level range: minLevel=maxLevel (12/16)
- Slot + set + rank + rarity + main stat anchored
