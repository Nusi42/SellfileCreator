# Tooltip Surfaces — 2025 Refresh

> **Canonical reference:** The full tooltip/context-hint specification now lives in `docs/technical/ui-and-layout.md#tooltips-and-context-hints`. This file exists only as an operational snapshot until we delete it; keep it in sync with the docs or replace it outright once downstream consumers stop depending on it.

The February 2025 refactor collapsed every tooltip surface onto two React components:

1. **`MarkdownTooltip`** – the single source of truth for rendered tooltips. It still wraps MUI’s `<Tooltip>` under the hood, but it enforces the shared delay (`MARKDOWN_TOOLTIP_ENTER_DELAY_MS` = 250 ms), width (`MARKDOWN_TOOLTIP_MAX_WIDTH_PX`), and arrow/interactivity config. Callers either pass a localized markdown string (`markdown=...`) or supply rich JSX via `render=...` when colors, chips, or glyphs are required.
2. **`EllipsisTooltip`** – a guard that measures whether a child is visually truncated. When the measurement succeeds it opens a `MarkdownTooltip`; otherwise nothing renders. It accepts either plain strings or JSX nodes and obeys the same global delay, because it delegates to `MarkdownTooltip`.

No other tooltip entry points remain. Every legacy `<Tooltip>`/`title=` usage was replaced, and `WithSetTooltip` now composes `MarkdownTooltip` internally. The only place we still import `@mui/material/Tooltip` directly is inside `MarkdownTooltip.tsx`.

## Component map

| Surface | Component(s) | Notes |
| --- | --- | --- |
| Builder form labels (action/rank/rarity/faction/level/main/substats/slots/etc.) | `MarkdownTooltip` + `BuilderTooltipContent` | All of the helper text that previously lived in inline `<Tooltip>` nodes now routes through the markdown wrapper, so bullet lists and tri-state hints follow the global style/delay. |
| Builder action buttons (add/save, undo/redo, export modes, help) | `MarkdownTooltip` | Tooltips that expose multi-line guidance (insert/save when configs are hidden, undo history snapshots, etc.) now share `slotProps` to cap width but otherwise use the shared wrapper. |
| Builder flex/min/threshold chips + lock toggles | `MarkdownTooltip` (`render`) | Components that display contextual icons still render JSX through the markdown wrapper so we keep colored badges without reintroducing raw `<Tooltip>`. |
| Builder ellipsis-only surfaces (note/save buttons, metaset button, select renderers) | `EllipsisTooltip` | Wherever the tooltip exists purely to expose truncated text, we wrap the button/select in `EllipsisTooltip` and tag the text node with `data-ellipsis-target`. |
| Rules filter chips/toggles | `MarkdownTooltip` for guidance, `EllipsisTooltip` for summaries | Glyph legend helpers now return markdown strings (e.g., `≥ 0 = show any`) so we can hand them to `MarkdownTooltip`. Icon/button labels use `EllipsisTooltip` so the tooltip only appears when text overflows. |
| Tables (HSF preview, tester grid) | `EllipsisTooltip` for overflow cells, `MarkdownTooltip` everywhere else | Slot/faction/set icons and column headers now pull tooltips from `MarkdownTooltip`. Substat summaries wrap their chips with an `EllipsisTooltip` when text is clipped by scroll containers. |
| Context menus (history, builder substat menus, config chips) | `MarkdownTooltip` | Every inline helper `BuilderTooltipContent` now renders through the shared wrapper, so keyboard navigation/poppers behave consistently. |
| Set descriptions (`WithSetTooltip`) | `MarkdownTooltip` (`render`) | The structured descriptions still render JSX (piece counts, colored buffs), but they flow through `MarkdownTooltip` so the only timing knob lives in one place. |
| Glyph/legend helpers (`renderGlyphTooltip`) | `MarkdownTooltip` (`markdown`) | Helper now returns a markdown string (`description` + bullet list) so chips/buttons can call `<MarkdownTooltip markdown={renderGlyphTooltip(...)}/>` without JSX. |
| Native titles | *None* | Browser `title=` attributes were removed entirely. Every tooltip now funnels through `MarkdownTooltip` or `EllipsisTooltip`. |

## Ellipsis inventory

Surfaces that only show a tooltip when text is truncated now share the same helper. Representative examples:

- Iconic buttons whose labels can collapse (builder note/save buttons, header actions).
- All select `renderValue` spans (gear sets/factions/champions, builder set/faction pickers, rules filter chips).
- Table cells that toggle between icons and text (HSF slot/faction columns, metaset menus, builder set menus).
- Config/tester chips that expose long rule summaries.

`EllipsisTooltip` keeps the popper inside the current scroll container to avoid viewport jitter, so no callers need to manage `disablePortal` or delay props manually.

## Markdown inventory

Anything that is not overflow-triggered runs through `MarkdownTooltip`. A non-exhaustive grouping:

- Builder form labels, action buttons, flex/min controls, lock toggles, roll target warnings, and history entries.
- Rules filter chips/toggles (sets, chaos ore, glyph filters, roll summary), tester config buttons, preview limit toggles.
- Headers, icons, and buttons inside the HSF preview table and tester grid.
- Dialog controls (Note dialog toolbar, Keep Uniques tabs, Substat Targets star chips, Rule Tester buttons).
- Menu helpers (context-menu close buttons, builder substat expectations panel, metaset action buttons).
- Export/load/save buttons, load-sellfile helpers, final-sell toggles, etc.

If a tooltip needs rich formatting (colored badges, inline icons), the caller passes `render={<BuilderTooltipContent .../>}` or another JSX node to `MarkdownTooltip`. Everything else uses `markdown=` strings, which keeps translation files readable and ensures list formatting renders consistently.

## Verification

- `rg '<Tooltip' src` returns only the definition in `MarkdownTooltip.tsx`.
- `rg 'title=' src` matches only `EllipsisTooltip` props or component props such as `title="Sets"` on menu sections.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` all pass after the refactor, confirming that every tooltip now flows through the shared wrappers.
