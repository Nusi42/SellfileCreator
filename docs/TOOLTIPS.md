# Tooltip & Context-Hint Inventory

## Context menu hints (ContextMenuHintOverlay)
- `builderSubstats`, `builderInsertMenu`, `builderApplyMenu`, `builderReset`, and `builderHistoryMenu` — Right-clickable surfaces in the builder show `t('contextMenuHint')` until the user dismisses it per app version.
- `configChipsArea` and `configChipsMenu` — The saved-config chips area + individual chip menu expose the same hint so players learn about Duplicate/Move/Copy/Paste.
- `previewExportMenu` — Right-click the export button to pick deduped export, default dedupe toggle, and “omit disabled” options; hint string `contextMenuHint`.
- `rulesTableHeader` and `rulesTableRows` — Table header gets `contextMenuHintRulesTableHeader` (mentions column management) while rows reuse `contextMenuHint` for the row menu.
- `rulesFilterSections` — Chevron toolbar shows the hint when users hover without opening the context menu; ctrl/meta-click still applies the collapse/expand all behavior.
- `ruleTesterCompact` — The compact/expanded toggle in the Rule Tester dialog shows the hint to explain that right-clicking the tester intro block reveals the clipboard helper.

## Button/tooltips tied to new flows
- Rule Tester copy-path button — Tooltip text comes from `t('rowMenuCopy')` and the button lives inline with the `%APPDATA%\\RslHelper\\Config` path; document that this tooltip must stay in sync with the clipboard fallback dialog.
- Preview header copy-path button — Shares the same tooltip text and status toast as the dialog button; note that both rely on `writeTextSafe` plus the fallback copy dialog.
- Builder auto-reset / auto-apply toggles — Describe the tooltip text that clarifies mutual exclusion.

## Shared tooltip helpers
- `src/components/MarkdownTooltip.tsx` — Wraps MUI Tooltip with a fixed 250 ms enter delay, theme-aware width cap, and simplified Markdown rendering (paragraphs, bullet lists, `**bold**`, `_italic_`, inline `` `code` ``). Use this component for explanatory copy everywhere so translators keep working with plain strings and hover timing stays consistent.
