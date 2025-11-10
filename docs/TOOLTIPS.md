# Tooltip Inventory

Comprehensive list of tooltip and tooltip-like surfaces in the Sellfile Creator.
Entries include purpose and notable styling behavior so follow-up discussions can
target the right implementation.

## Global Behavior
- `src/theme.ts` defines the `MuiTooltip` baseline: arrow enabled, default
  placement `top-start`, Popper modifiers for `offset=[0,8]` plus
  `preventOverflow` against the viewport, and a `tooltip` style override
  (`fontSize` equal to the secondary body size, `maxWidth: 640px`).
- `src/hooks/useTooltipScrollGuard.ts` toggles a `scrolling` class on the body
  for `SCROLLING_TOOLTIP_HIDE_MS` (250 ms) while the user scrolls, and dispatches
  a resize event to reflow Popper after scrolling stops.
- `src/App.tsx` applies a `GlobalStyles` rule that hides all `.MuiTooltip-popper`
  elements whenever the body has the `scrolling` class (prevents tooltips from
  flickering while scrollbars appear).

## Custom Tooltip Helpers
- `src/components/EllipsisTooltip.tsx`  
  Wraps content and only opens when the measured target is actually truncated.
  It keeps tooltips inside the scrolling container (`disablePortal` by default),
  closes them while the app reports scrolling, and exposes optional max-width
  control.
- `src/components/SetTooltip.tsx` (`WithSetTooltip`)  
  Builds rich, multi-line tooltips for artifact sets (header, divider, per-piece
  description). Uses arrowed tooltips, `placement="right"`, `enterDelay={180}`,
  and `disableInteractive` to keep hover behavior predictable.
- `src/components/BuilderTooltipContent.tsx`  
  Formats multi-line instructional text (bullets, colored stats, set icons) that
  many Builder tooltips render inside their `title`.
- `src/components/ClearIconButton.tsx`  
  Adds a Tooltip only when a `tooltip` prop is supplied; disables hover/focus
  listeners while the button is disabled and re-enables pointer events on the
  tooltip surface (`componentsProps.tooltip.sx.pointerEvents = 'auto'`).
- `src/components/SubstatToggleDisplay.tsx`  
  Provides two tooltips: one for the lock toggle (only active when copy is
  provided) and another for the roll indicator (only active when the row is
  interactive). Both rely on `disableHoverListener` guards to avoid empty shells.
- `src/history/historyTooltip.ts`  
  `formatHistoryTooltipText` composes bullet-style strings for the Builder’s
  undo/redo tooltips (title plus `•`-prefixed detail lines).
- `src/components/ContextMenuHintOverlay.tsx`  
  Custom fixed-position “hint bubble” that follows the cursor when context menu
  help is available. Styling mimics a tooltip (blurred background, high z-index).
- `src/components/tutorial/TutorialCoach.tsx`  
  Coach-mark overlay with a floating panel that behaves like an anchored tooltip
  for tutorial steps (fixed positioning, animated transitions, pointer-aware
  placement logic).

## Feature Areas

### App Shell
- `src/App.tsx` – Help button in the header sits in a default MUI Tooltip
  (`helpOpenTooltip` text).
- `src/components/HeaderActions.tsx` – Primary buttons use native
  `title={…}` (Edit/Add Note; Save HSFC) so the OS shows a tooltip even when
  labels are truncated.

### Builder Workflow
- `src/components/BuilderPanel.tsx`
  - Form labels (“Action”, “Rank”, “Rarity”, “Faction”, “Min Level”, “Max Level”,
    “Substat Flex”, etc.) wrap their heading in a Tooltip whose `title` is a
    `<BuilderTooltipContent>` instance. Each pulls the relevant `builder*` help
    strings plus `builderMultiMixedTooltipSuffix` for multi-edit guidance.
  - Undo/Redo IconButtons use Tooltips that render
    `<BuilderTooltipContent>` with the history preview string. They force a
    narrower tooltip (`slotProps.tooltip.sx.maxWidth =
    HISTORY_TOOLTIP_MAX_WIDTH_PX`) and wrap the IconButton in a `<span>` so the
    tooltip stays enabled when disabled.
  - The inline help IconButton (`builderHelpOpen`) uses a simple tooltip with the
    same copy.
  - Builder actions that can create hidden configs use
    `builderInsertHiddenTooltip` / `builderSaveHiddenTooltip` Tooltips to warn
    users (one disables interaction when the warning does not apply).
  - Tooltip content for auto-flex, auto min rolls, and similar switches comes
    from `<BuilderTooltipContent>` so colored stat chips render consistently.
  - Native `title` attributes expose full faction labels inside the select
    renderValue, ensuring truncated rows still surface the complete label.
- `src/components/ConfigChip.tsx`
  - Row reordering / duplicate / delete buttons show simple Tooltips
    (`chipBtn*` copy) with `slotProps={{ popper: { disablePortal: true } }}` so
    the popper stays inside the chips scroller.
  - The chip body can show a hover tooltip (`tooltipTitle`) when the summary is
    truncated; open state is manually managed (`open={chipHover && !overControls
    && !scrolling}`) and the popper portal is disabled to avoid clipping.
  - Native `title` attributes surface additional details: faction icons push the
    localized faction name; roll indicators explain min/max badges; metaset icons
    carry the metaset name; set icons carry localized set names.
- `src/components/HeaderActions.tsx` (Builder header) – Buttons rely on native
  `title` attributes for consistent OS tooltips when labels overflow.
- `src/components/SubstatToggleDisplay.tsx` – Lock badge tooltip strings come
  from `builderSubstatLockTooltip*`; roll indicator tooltips come from per-field
  data (`indicator.tooltip`). Both disable hover listeners when no text.

### Preview & Tester
- `src/components/PreviewHeaderActions.tsx`
  - Filter toggle button’s tooltip uses `filterTooltip`.
  - Final Sell toggle uses `addFinalSellTooltip`; the adjacent config
    button uses generic `configure` copy.
  - “Load Sellfile” button shows a multi-line tooltip (rendered as a `<Box>`
    inside the `title`) to explain optional loading; Export button’s tooltip
    concatenates runtime messages (`pushSellfileTooltip`, `exportIgnoresFilters`)
    and wraps `DirtyBadge`.
- `src/components/HsfRulesTable.tsx`
  - Header cells expose `rulesHeaderHelp` via Tooltips.
  - When slot icons are enabled, the icons are wrapped in a Tooltip containing
    the concatenated artifact type names (preventing loss of meaning on icon-only
    rows).
  - Faction icons ride inside Tooltips with the localized faction label.
  - Substat summary cells use a Tooltip that mirrors the formatted chip summary
    (`getSubstatTooltipSummary`) for overflow or icon mode.
  - “Manage Colors” icon button shows `manageColors`, and header menu toggles use
    `headerMenuShownInTable` / `headerMenuHiddenInTable`.
  - Cells fall back to `EllipsisTooltip` to expose truncated text.
- `src/components/dialogs/RuleTesterDialog.tsx`
  - The combined rule/config chip carries the config label, sets a native `title` for overflow, and when clickable exposes `testerJumpToConfig`.
  - Row controls (add/delete) use `add` / `delete` Tooltips; the layout toggle
    uses a dynamic tooltip (`expanded` / `compact` / “Coookieees!” easter egg).
  - Faction icon chips inside the tester use Tooltips so the localized faction
    name stays discoverable.
  - Dialog close IconButton uses `close`.
- `src/components/dialogs/FinalSellDialog.tsx`
  - The +16 toggle (`key === 16`) is wrapped in a Tooltip with
    `offByDefaultTooltip` to remind users why the level is hidden initially.

### Sets & Metasets
- `src/components/SetsOrderControls.tsx` – Toggle buttons present Tooltips for
  each order mode (`setsTooltipIcons`, `setsTooltipGame`, `setsTooltipAz`).
- `src/components/MetasetsDialog.tsx`
  - Move up/down arrows and visibility toggles use Tooltips
    (`metasetsMoveUp`, `metasetsMoveDown`, `metasetsHiddenFromMenus` /
    `metasetsVisibleInMenus`).
  - The usage chip (when metaset is referenced) uses `metasetsUsesTooltip`.
  - Menu entries reuse `SetMenuSection` and inherit its tooltips (`WithSetTooltip`
    for icon mode, `EllipsisTooltip` for truncated text).
  - Menu trigger elements and glyphs use native `title` attributes to surface the
    set list (`m.sets.map(...)`).
- `src/components/SetMenuSection.tsx`
  - Text rows render via `EllipsisTooltip` so long set names stay discoverable.
  - Icon-grid items wrap `WithSetTooltip` (`showName` when requested) so users
    can inspect the set description while hovering the icon.
- `src/components/SetTooltip.tsx`
  - See “Custom Tooltip Helpers” section – this is the shared implementation
    used by Set menus and builder UI.

### Filters
- `src/components/RulesFilterPanel.tsx`
  - `anyChip` helper wraps each chip in a Tooltip carrying
    `filterAnyTooltip` explaining how “Any” behaves.
  - Preview config toggle shows `filterLimitPreviewConfigsTooltip`.
  - Config filter toggle shows `filterLimitSelectedConfigsTooltip`, noting that the control filters both preview modes (On/Off in Sellfile view and First/Any in Rule Tester).
  - Mode switches for Sets/Substats use `filterMatchTooltipSets` /
    `filterMatchTooltipSubstats`.
  - Slot icon toggle buttons show per-slot names via Tooltips (`placement="bottom"`,
    `disableInteractive`).
  - Rank and rarity quick-select helpers have Tooltips
    (`filterSelectRank13`, `filterSelectRarityCU`).
  - Multiple renderers add `EllipsisTooltip` or native `title` attributes to
    expose truncated autosummary chips and metaset names.
- Native `title` attributes on ToggleButtons (“Any”, “Disabled”, etc.) provide an
  OS tooltip fallback when the icons alone would be ambiguous.

### Notes & Substat Targets
- `src/components/SubstatTargetsDialog.tsx` – Header chips for “Use this star as Any”
  show `minimaUseForAnyTooltip` and reuse Chip styling to stay consistent with
  builder warnings.
- `src/components/NoteDialog.tsx`
  - Color picker swatches use Tooltips (`placement="bottom"`, `disableInteractive`)
    with `noteColorTooltip`.
  - Markdown toolbar buttons are rewrapped so each command button shows a
    localized tooltip (derived from the Markdown command or fallback label).

### Utility Buttons & Inputs
- `src/components/FilePickerButton.tsx` – Applies a `title` attribute so the OS
  renders a tooltip with the resolved label; useful when the button is icon-only.
- `src/components/ColorField.tsx` – Uses a `title` attribute with the current
  label to expose the full color name when the button is narrow.
- `src/components/ClearIconButton.tsx` – See “Custom Tooltip Helpers”.

## Tooltip-Like Overlays
- `src/components/ContextMenuHintOverlay.tsx` provides transient hover hints for
  areas that support context menus (builder history timeline, rules table).
- `src/components/tutorial/TutorialCoach.tsx` replaces the standard tooltip with
  a guided, animated panel; mention here for completeness even though it is not
  built on `Tooltip`.

## Native `title` Attributes (OS Tooltips)
- Builder faction select renderers and ConfigChip icons use `title` to expose
  full text when the inline layout truncates.
- `src/components/HeaderActions.tsx`, `src/components/FilePickerButton.tsx`,
  `src/components/ColorField.tsx`, and assorted filter ToggleButtons supply
  `title` values so the browser draws a default tooltip when the button is
  rendered as an icon or clipped label.
- ConfigChip substat roll badges and metaset glyphs use `title` to communicate
  the underlying numbers or names even when no MUI tooltip is present.

This inventory should cover every tooltip entry point. If you spot any gaps or
new tooltip needs, please reference the relevant bullet above when proposing
changes.
