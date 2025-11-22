# Current Tooltip Inventory

This file documents every tooltip or tooltip-adjacent surface in the Sellfile Creator so we can normalize copy, style, and timing. Tooltips fall into two buckets:

- **OS-native** (`title` attributes or browser default tooltips) — used mainly for truncated labels or icon-only controls. No delay and rendered by the browser.
- **MUI custom tooltips** — Material UI’s `<Tooltip>` component (global defaults defined in `src/theme.ts`). Unless stated otherwise they inherit the global arrowed style, `placement="top-start"`, `disableInteractive`, `offset=[0,8]`, `preventOverflow`, and `enterDelay` from MUI (≈0 ms today).

## Global Behavior
- `src/theme.ts` (`MuiTooltip` overrides) — arrow enabled, placement `top-start`, Popper modifiers `offset=[0,8]` and `preventOverflow` against the viewport, tooltip font size set to the secondary body size, and `maxWidth: 640px`.
- `src/hooks/useTooltipScrollGuard.ts` — applies a `scrolling` class for `SCROLLING_TOOLTIP_HIDE_MS` (250 ms) while the user scrolls, hides every `.MuiTooltip-popper` via `GlobalStyles` in `App.tsx`, and dispatches a resize after scrolling stops so Popper recalculates placement.
- `src/hooks/useScrollingFlag.ts` — shared store used by tooltip consumers such as `EllipsisTooltip` to suppress hover tooltips while scrolling to avoid stale placement.

## Shared Helpers
- `src/components/EllipsisTooltip.tsx` — wraps arbitrary content, measures whether the target node is truly ellipsized, and only opens the tooltip when overflow is detected. Defaults to `disablePortal` so poppers stay inside scrollable containers and closes while scrolling.
- `src/components/BuilderTooltipContent.tsx` — renders multi-line builder copy with optional bullet lists, colored stat text, and set icons. Consumed by most builder-related `<Tooltip>` instances to keep formatting consistent.
- `src/components/SetTooltip.tsx` / `WithSetTooltip` — builds structured set descriptions (header, divider, per-piece body). Uses `arrow`, `placement="right"`, `enterDelay={180}`, and `enterNextDelay/leaveDelay=0` so icon grids expose set information without popper jitter.
- `src/components/ClearIconButton.tsx` — optional tooltip channel for the “X” control; disables hover/focus/touch listeners while the button is disabled and re-enables pointer events on the tooltip payload.
- `src/components/SubstatToggleDisplay.tsx` — exposes two tooltips per row (one on the lock toggle, one on the roll indicator). Both are opt-in and use `disableHoverListener` guards when no copy is provided.
- `src/components/ContextMenuPaper.tsx` — wraps menu papers with a floating close button that is itself wrapped in a Tooltip showing the localized close label.
- `src/components/ContextMenuHintOverlay.tsx` — blur-backed overlay that behaves like a tooltip to teach context menu entry points (builder buttons, chips area, rules table, tester grid, filter chevrons, etc.).
- `src/components/GridIconBox.tsx` — centralizes set icon tooltips (`WithSetTooltip`) plus reroll tooltips (`Tooltip title={rerollTooltip}`) for the preview/tester cards.
- `src/history/historyTooltip.ts` — `formatHistoryTooltipText` composes title + `• detail` lines so builder undo/redo tooltips stay readable.
- `src/components/tutorial/TutorialCoach.tsx` — guided coachmark overlay that visually behaves like an anchored tooltip panel during the tutorial (placement logic, animation, pointer lockout).

## Native / OS Tooltip Patterns
- Buttons rendered with ellipsized labels (`HeaderActions`, `BuilderColumn` substat values button, `FilePickerButton`, color swatches, filter toggle buttons) use `title={label}` so the browser provides an immediate tooltip.
- Icon-heavy chips (builder config factions, metaset icons, tester reference chips, gear/faction selects) set `title` to the localized label to keep the text accessible when truncated.
- Config chips and rule tester chips add `title` to duplicate/multi-select badges and metaset indicators so OS tooltips expose the full set or metaset name.
- Toggle buttons in `RulesFilterPanel`, Builder slot/rank quick selectors, Rule Tester headers, Final Sell selectors, and filter toggles all set `title` for clarity when icons alone are ambiguous.

## Area Inventory

### App Shell & Layout
- `src/App.tsx` — the header Help button is wrapped in a default tooltip (`t('helpOpenTooltip')`). `GlobalStyles` hides `.MuiTooltip-popper` while `body.scrolling` or `.chips-dragging` are set.
- `src/components/AppLayout/BuilderColumn.tsx` — the “Substat values” button relies on a native `title={substatValuesLabel}` tooltip so the full text remains visible even if the button shrinks.
- `src/components/HeaderActions.tsx` — “Add/Edit Note” and “Save HSFC” buttons use `title={...}` for browser tooltips; chip counts rely on OS tooltips when truncated.
- `src/components/FilePickerButton.tsx` — always sets a `title` (label or override) so icon-only file pickers expose their purpose.
- `src/components/ColorField.tsx` — color chip buttons set `title={label}` so the selected color name is discoverable.

### Builder Core
- `src/components/BuilderPanel.tsx`
  - Nearly every `FormLabel` wraps its heading in a Tooltip with `<BuilderTooltipContent>`: Action, Export Mode (active/disabled/separator states), Rank, Rarity, Faction, Level bounds, Keep/Sell toggles, Min/Max Count, Auto Flex, Roll bounds/targets, Substat requirements, Milestones, Sets, etc. Multi-edit surfaces append the `builderMultiMixed*` hints.
  - Undo/Redo buttons render tooltips with history previews (via `BuilderTooltipContent` + `HISTORY_TOOLTIP_MAX_WIDTH_PX`). The buttons are wrapped in `<span>` so the tooltip remains accessible when disabled. Tooltip delay uses the default theme.
  - `BuilderPanel` registers `useTooltipScrollGuard()` so these tooltips respect the scroll suppression class.
  - The inline Help button (`builderHelpOpen`) uses a simple tooltip; rule count chip uses `title={limitWarningTooltip}` whenever the worker reports a hard limit from `useRuleCountBadge`.
  - Auto apply/reset toggles, insert/save buttons, and visibility warnings use tooltips (`builderInsertHiddenTooltip`, `builderSaveHiddenTooltip`) that are disabled when the warning does not apply; the save button also shows a forced-open tooltip (`open={saveTooltipOpen}`) when highlighting the “hidden config” state.
  - Rank/range quick-pick helpers, auto-flex chips, “required rolls” lock icon, tri-state set selectors, metaset dropdowns, and `SetMenuSection` rows all surface tooltips via `BuilderTooltipContent`, `WithSetTooltip`, or `EllipsisTooltip`.
  - Substat lock badges use `enterDelay={200}` arrowed tooltips for Lock/Unlock copy; per-substat warnings also use `enterDelay={200}`.
  - Config count gating (Add/Save buttons) uses tooltips derived from `builderMaxConfigsReached`, `builderNeedSelection`, etc. Buttons wrap their `title` strings in `<BuilderTooltipContent>` when multi-line text is needed.
  - Insert/Save buttons, builder history apply/reset buttons, and multi-edit selections all show context-menu hints via `ContextMenuHintOverlay`, which mimics tooltip styling.
- `src/components/ConfigChipsPanel.tsx`
  - Each chip inherits tooltips from `ConfigChip` (see below) and the scrolling container triggers `ContextMenuHintOverlay` to teach right-click functionality.
  - While chips are dragged the panel sets `hideTooltip` to suppress chip tooltips.
- `src/components/ConfigChip.tsx`
  - Action buttons (move up/down/top/bottom, duplicate, delete, copy) use Tooltips with `t('chipBtn*')` strings and keep Popper inside the chips scroller.
  - Chips with hidden matches include a tooltip describing duplicates (`chipTooltipDuplicateOf`) and optionally the full summary when truncated; open state is manually controlled so tooltips don’t linger when hovering action buttons. Portal stays disabled.
  - Inline glyphs use native `title` attributes (factions, metasets, set icons, roll badges) to expose localized labels when space is constrained.
- `src/components/HistoryContextMenu.tsx`
  - Each menu item wraps the row in a tooltip containing `<BuilderTooltipContent>` with history diff lines. Tooltips cap width to `HISTORY_TOOLTIP_MAX_WIDTH_PX`. `ContextMenuPaper` adds a close-button tooltip.
  - The context menu itself shows `ContextMenuHintOverlay` to describe right-click surfaces upstream.
- `src/components/builderPanel/useRuleCountBadge.ts` — produces the `limitWarningTooltip` string that feeds `RuleCountChip.title` so the OS tooltip explains why the rule count badge is red.

### Preview, Export & Final Sell
- `src/components/PreviewHeaderActions.tsx`
  - Filter toggle button uses a tooltip (`filterTooltip`), final sell toggle uses `addFinalSellTooltip`, and the adjacent settings button uses `configure`.
  - The “Load Sellfile” icon button shows a two-line tooltip describing the optional import. Gear DB status badges use Tooltips to show success/error text.
  - The Export button + `DirtyBadge` wrap everything in a tooltip composed of runtime messaging (push endpoint labels, filter bypass notices). Context menu hints explain deduped export options, and the `ContextMenuHintOverlay` mirrors tooltip styling.
  - Rule Tester jump button uses `title={ruleTesterLabel}` for OS fallback.
- `src/components/dialogs/FinalSellDialog.tsx` — the +16 level toggle is wrapped in a Tooltip (`offByDefaultTooltip`) to explain why it is treated specially; other toggles rely on OS `title`.

### Rules Table & Filters
- `src/components/HsfRulesTable.tsx`
  - Table headers wrap glyphs in tooltips for `rulesHeaderHelp` copy; slot icons, faction icons, and substat chips use `WithSetTooltip`, `Tooltip`, or `EllipsisTooltip` to expose their text when icons or ellipses hide the label.
  - Grid toolbar icons use Tooltips (`manageColors`, header menu show/hide strings). Summary cells that overflow use `EllipsisTooltip`.
- `src/components/RulesFilterPanel.tsx`
  - Toggle buttons and switches include native `title` values (e.g., `any`, `keep`, `sell`, slot glyph names) for OS tooltips.
  - Glyph legend rows use multi-line tooltips such as `filterMatchTooltipSets`, `filterGlyphsTooltip`, `filterChaosOreTooltip`, `filterMatchTooltipSubstats`, etc., each rendered with inline Markdown fragments via `renderGlyphTooltip`.
  - Roll summary chips, tester config filters, column hints, and filter limit toggles have dedicated tooltips.
  - `ContextMenuHintOverlay` is tied to the chevron toolbar (`rulesFilterSections`) to teach right-click behavior.

### Tester Surfaces
- `src/components/TesterItemsGrid.tsx`
  - Stat color palette toggle buttons and “Manage Colors” action expose tooltips describing the current mode.
  - Set glyphs wrap `GridIconBox` (`WithSetTooltip`) so each grouped/tester entry shows the full set description.
  - Every source glyph (inventory/vault/collection/inbox/manual) shares a tooltip generated by `getItemSourceDescriptor`. Champion icons also get OS `alt` text derived from the same string so tooltips match accessible names.
  - Reroll badges, level chips, and substat summary blocks use tooltips produced by `formatSubstats`.
  - The “+N more matches” chip shows a tooltip summarizing the count before the popover opens.
  - Rule reference chips (primary and extra matches) use `Tooltip title={t('testerJumpToConfig')}` to teach the “jump to builder” action.
  - `ContextMenuHintOverlay` is active for the tester grid container so right-click menu hints mirror builder/rules behavior.
- `src/components/GridIconBox.tsx` — set icons get `WithSetTooltip` (optionally with display name), reroll badges wrap `Tooltip title={rerollTooltip}`, and source overlays reuse the tester source tooltips.
- `src/components/TesterRuleReferenceChip.tsx` — clickable chips are wrapped in `Tooltip title={t('testerJumpToConfig')}` while always setting `title={label}` for OS fallback.
- `src/components/dialogs/KeepUniquesTab.tsx` — overall tab hint (`keepUniquesTabHint`), detection rows (`keepUniquesRuleCountsTooltip`), and inline Info icons use Tooltips to guide the keep-uniques automation.

### Rule Tester
- `src/components/dialogs/RuleTesterDialog.tsx`
  - Row controls (add/delete) use tooltips (`t('add')`, `t('delete')`); the compact/expanded toggle has a dynamic tooltip that switches between `testerCompactLabel`, `testerExpandedLabel`, or the “Coookieees!” easter egg string.
  - Faction icon chips show tooltips with the localized faction name; set selectors use `WithSetTooltip` and `EllipsisTooltip`.
  - Copy-to-clipboard buttons (Gear DB path, tester intro path) wrap their IconButtons in tooltips to mirror the context menu labels.
  - Dialog close button uses `Tooltip title={t('close')}`; footer buttons rely on OS `title`.
  - The context-hint overlay surfaces on the compact-mode toggle and tester intro area to show the right-click clipboard helper.

### Sets & Metasets
- `src/components/SetsOrderControls.tsx` — Toggle buttons expose tooltips for each layout (`setsTooltipIcons`, `setsTooltipGame`, `setsTooltipAz`). Clear-search button inherits default `Tooltip` behavior via `IconButton` `aria-label`.
- `src/components/MetasetsDialog.tsx`
  - Reorder arrows (`metasetsMoveUp/Down`), visibility toggle (`metasetsHiddenFromMenus` vs `metasetsVisibleInMenus`), and usage badges (`metasetsUsesTooltip`) all use Tooltips.
  - Set-select dropdowns wrap their labels with `EllipsisTooltip` (the select itself also uses `title` listing the selected sets).
  - The sets grid within the dialog reuses `SetMenuSection` and `WithSetTooltip`.
- `src/components/SetMenuSection.tsx` — list rows rely on `EllipsisTooltip` for metaset notes, and icon items wrap `WithSetTooltip` (optionally with `displayName`). Multi-edit partial selections add dashed styling plus the same tooltip copy.
- `src/components/gear/GearSetsSelect.tsx` / `gear/GearFactionSelect.tsx`
  - Selected chips use `EllipsisTooltip` to expose the combined set/faction names. Menu rows wrap their captions so icon grids continue to show tooltips even when rendered inside constrained dialogs.

### Dialogs & Editors
- `src/components/SubstatTargetsDialog.tsx` — star header chips show `substatTargetsUseForAnyTooltip`; the chip label is wrapped in a tooltip and sets `aria-label`.
- `src/components/NoteDialog.tsx`
  - Markdown color picker buttons use bottom-placed Tooltips (`noteColorTooltip`). The markdown toolbar re-wraps each command button in a tooltip that maps the command ID to a localized label so authors see native-language tooltips.
  - Status badges (pending uploads, errors) inside the dialog rely on default `Tooltip` styling when necessary.
- `src/components/NoteDialog` copy-path buttons? (They reuse the same tooltips as the dialog copy surfaces via the shared toolbar logic.)
- `src/components/dialogs/SubstatTargetsDialog.tsx` plus `SubstatToggleDisplay` (see helper section) keep star-level tooltips consistent.

### Miscellaneous Utilities
- `src/components/HeaderActions.tsx` and `src/components/PreviewHeaderActions.tsx` both rely on `FilePickerButton`’s `title` to surface file picker purpose when rendered as icons.
- `src/components/ClearIconButton.tsx` (see helpers) is used across Preview header, chips panels, etc., keeping the tooltip behavior consistent.
- `src/components/ContextMenuPaper.tsx` ensures every context menu has a close-button tooltip without each menu re-implementing it.
- `src/components/dialogs/RuleTesterDialog.tsx`, `src/components/PreviewHeaderActions.tsx`, and `src/components/TesterItemsGrid.tsx` wire up `ContextMenuHintOverlay` surfaces; the overlay deliberately mimics tooltip visuals even though it is a custom component.

## Native Title Surfaces At-a-Glance
- Builder faction selects, metaset labels, Gear set/faction selects, tester group headers, and config chips all set `title` to expose the full text when ellipsized.
- Header buttons (“Add Note”, “Save HSFC”, “Rule Tester”, substat values) use `title` to retain clarity at narrow widths.
- Toggle buttons across Builder, Filters, Final Sell, Tester, and Keep Uniques use `title` strings tied to the current option so icon-only toggles are still understandable without the MUI tooltip delay.

This inventory now covers every tooltip-producing component (OS and MUI) in the repo. Use it as the source of truth when aligning styling, delay, or tooltip copy across future refactors.
