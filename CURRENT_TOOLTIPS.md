# Current Tooltip Inventory

Every tooltip surface is cataloged below so we can normalize behavior. Tables list the owning file, the UI element, the implementation (component/class or native attr), the visual style, and any explicit timing overrides.

## Legend
- **Implementation** – `MarkdownTooltip`, `EllipsisTooltip`, raw MUI `<Tooltip>`, `WithSetTooltip`, or native `title` attribute. For helper components see the shared notes below.
- **Style** – `Markdown` (string parsed to simplified markdown), `Markdown (render)` (JSX passed through MarkdownTooltip), `JSX` (custom React nodes handed to `<Tooltip>` or `WithSetTooltip`), or `OS` (browser tooltip via `title=`).
- **Custom Timing** – Non-default delays such as `enterDelay`. `Default` means we rely on component defaults (`MarkdownTooltip` = 250 ms, MUI Tooltip = library defaults, OS = immediate).

## Shared Implementations
- **MarkdownTooltip** (`src/components/MarkdownTooltip.tsx`) – wraps MUI Tooltip with `enterDelay=MARKDOWN_TOOLTIP_ENTER_DELAY_MS` (250 ms) and `maxWidth=MARKDOWN_TOOLTIP_MAX_WIDTH_PX` (520 px unless overridden). Accepts either `markdown` strings or a `render` node.
- **EllipsisTooltip** (`src/components/EllipsisTooltip.tsx`) – measures whether the child content is ellipsized and, only then, shows a `MarkdownTooltip` (same 250 ms delay). Supports string or JSX titles and keeps Popper inside the current scroll container.
- **WithSetTooltip** (`src/components/SetTooltip.tsx`) – wraps children in a MUI `<Tooltip>` that renders structured JSX with piece counts. Always `arrow`, `placement="right"`, `enterDelay=180 ms`, `enterNextDelay=0`, `leaveDelay=0`.
- **Markdown-aware helpers** (e.g., `ClearIconButton`, `ContextMenuPaper`) compose `MarkdownTooltip` internally; they still share the 250 ms delay.
- **Native `title` attributes** – rely on the browser/OS tooltip (instant). Used only when we need to expose truncated text or icon explanations without custom styling.

## Inventory by File

### src/App.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Header help button | MUI `<Tooltip>` | JSX (string) | Default | Wraps the Help button with `t('helpOpenTooltip')` while the button opens the tutorial. |

### src/components/AppLayout/BuilderColumn.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| “Substat values” button | Native `title` | OS | Immediate | The outline button’s `title` mirrors the label so the OS tooltip exposes the text when space is constrained. |

### src/components/HeaderActions.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| “Add/Edit Note” button | Native `title` | OS | Immediate | Keeps the icon-only button understandable at narrow widths. |
| “Save HSFC” button | Native `title` | OS | Immediate | Provides the action label even when the button shrinks. |

### src/components/FilePickerButton.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Exposed `Button` label | Native `title` | OS | Immediate | `title` defaults to `buttonTitle ?? label` so browser tooltips expose the picker’s purpose. |

### src/components/ColorField.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Color swatch button | Native `title` | OS | Immediate | Hovering the button shows the color name, which is especially useful when only the hex chip is visible. |

### src/components/ContextMenuPaper.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Context-menu close icon | MarkdownTooltip | Markdown | 250 ms | The floating close button surfaces the localized `closeLabel`. |

### src/components/NoteDialog.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Markdown color pickers | MarkdownTooltip | Markdown | 250 ms | Each swatch button shows `noteColorTooltip` under the cursor with placement `bottom`. |
| Markdown toolbar buttons | MarkdownTooltip | Markdown | 250 ms | Every toolbar command wraps the rendered button so localized labels (some containing markdown) display consistently. |

### src/components/dialogs/KeepUniquesTab.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Rule detection count summary | MarkdownTooltip | Markdown | 250 ms | Wraps the caption text so bullets or multi-line guidance can be added later. |
| Info icon in tab header | MarkdownTooltip | Markdown | 250 ms | Displays `keepUniquesTabHint` on hover. |

### src/components/SubstatTargetsDialog.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| “Use for Any” chips | MarkdownTooltip | Markdown | 250 ms | Each star chip shows `substatTargetsUseForAnyTooltip`, explaining the fallback behavior. |

### src/components/TesterRuleReferenceChip.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Final Sell / Keep Unique chips | Native `title` | OS | Immediate | Non-clickable chips always set `title` to expose the localized label. |
| Generic rule reference chip (static) | Native `title` | OS | Immediate | The composed label is assigned to the chip’s `title` so truncated labels can be read. |
| Rule reference chip (clickable) | MarkdownTooltip | Markdown | 250 ms | When `onJump` is provided the chip is wrapped so “Jump to config” is shown consistently. |

### src/components/dialogs/RuleTesterDialog.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Add-row icon button | MarkdownTooltip | Markdown | 250 ms | Uses `t('add')`. |
| Delete-row icon button | MarkdownTooltip | Markdown | 250 ms | Uses `t('delete')`. |
| Compact/expanded toggle | MarkdownTooltip | Markdown | 250 ms | Dynamically shows either `t('compact')`, `t('expanded')`, or the easter egg string. |
| Faction chip when icon visible | MarkdownTooltip | Markdown | 250 ms | Wraps the chip so the localized faction name shows even when only an icon renders. |
| Dialog close icon | MarkdownTooltip | Markdown | 250 ms | Provides `t('close')` on hover. |
| Copy gear DB path icon | MarkdownTooltip | Markdown | 250 ms | Explains the clipboard action (`copyGearDbPathLabel`). |
| Section buttons in footer | MarkdownTooltip + EllipsisTooltip | Markdown | 250 ms | `EllipsisTooltip` exposes truncated labels, and the wrapper `MarkdownTooltip` ensures consistent styling when not truncated. |

### src/components/SubstatToggleDisplay.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Lock badge | MarkdownTooltip | Markdown | 250 ms | Disabled when no copy is provided; keeps lock hints aligned with builder tooltips. |
| Roll indicator pill | MarkdownTooltip | Markdown | 250 ms | Guards multi-line roll guidance for the stat row. |

### src/components/PreviewHeaderActions.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Rule-limit warning chip | MarkdownTooltip | Markdown | 250 ms | Displays the multi-line `limitTooltip` copy. |
| Filter toggle button | MarkdownTooltip | Markdown | 250 ms | Wraps the filter button with `t('filterTooltip')`. |
| Final Sell toggle | MarkdownTooltip | Markdown | 250 ms | Explains `t('addFinalSellTooltip')`. |
| Final Sell “configure” button | MarkdownTooltip | Markdown | 250 ms | Uses `t('configure')`. |
| Optional Load Sellfile button | MarkdownTooltip | Markdown | 250 ms | Shows two-line instructions combining `loadSellfile` + `optionalLoadSellfile`. |
| Gear DB status badges | MarkdownTooltip | Markdown | 250 ms | Error/success badges each wrap the badge glyph with their detailed message. |
| Export button (DirtyBadge) | MarkdownTooltip | Markdown | 250 ms | Ensures long export guidance renders consistently. |
| Rule tester shortcut button | Native `title` | OS | Immediate | `title={ruleTesterLabel}` so browsers expose the label when the button is truncated. |

### src/components/SetsOrderControls.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| “Icons” toggle | MarkdownTooltip | Markdown | 250 ms | Shows `setsTooltipIcons`. |
| “Game order” toggle | MarkdownTooltip | Markdown | 250 ms | Shows `setsTooltipGame`. |
| “Az order” toggle | MarkdownTooltip | Markdown | 250 ms | Shows `setsTooltipAz`. |

### src/components/TesterItemsGrid.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| “Manage colors” button | MarkdownTooltip | Markdown | 250 ms | Explains the color palette controls inside the tester menu. |
| Matching config chips (clickable) | MarkdownTooltip | Markdown | 250 ms | `t('testerJumpToConfig')` shows on hover for each jump target. |
| Source champion portrait | MarkdownTooltip | Markdown | 250 ms | Full descriptor (inventory/vault/etc.) shown when hovering the portrait. |
| Vault badge overlay | MarkdownTooltip | Markdown | 250 ms | Shares the same descriptor as the portrait overlay. |
| Source glyph (compact mode) | MarkdownTooltip | Markdown | 250 ms | Ensures glyph-only badges still expose the source text. |
| Substat summary block | MarkdownTooltip | Markdown | 250 ms | Wraps the entire substat stack so long lines stay readable. |
| “+N matches” overflow chip | MarkdownTooltip | Markdown | 250 ms | Shows the total `testerConfigMatches` count before the popover opens. |
| Set icons in grid rows | WithSetTooltip | JSX | enterDelay 180 ms | Provided via `GridIconBox`/`WithSetTooltip` to show set descriptions. |

### src/components/GridIconBox.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Set icon overlay | WithSetTooltip | JSX | enterDelay 180 ms | Displays piece counts and descriptions. |
| Reroll badge | MarkdownTooltip | Markdown | 250 ms | Shows `rerollTooltip`. |
| Outcome glyph | MarkdownTooltip | Markdown | 250 ms | Displays `outcome.label` and optionally allows clicking to jump. |

### src/components/dialogs/FinalSellDialog.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| “+16” level toggle | MarkdownTooltip | Markdown | 250 ms | Highlights why +16 behaves differently (`offByDefaultTooltip`). |

### src/components/ConfigChip.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Move-up button | MarkdownTooltip | Markdown | 250 ms | Tooltip text `chipBtnMoveUp`; Popper kept inside the chips scroller. |
| Move-down button | MarkdownTooltip | Markdown | 250 ms | `chipBtnMoveDown`. |
| Duplicate button | MarkdownTooltip | Markdown | 250 ms | `chipBtnDuplicate`. |
| Delete button | MarkdownTooltip | Markdown | 250 ms | `chipBtnDelete`. |
| Entire chip (when `showTooltip`) | MarkdownTooltip | Markdown | 250 ms | Wraps the chip with the assembled summary tooltip when `showTooltip` is true. |
| Substat summary entries | MarkdownTooltip | Markdown (render) | enterDelay 200 ms | Uses `render={<BuilderTooltipContent .../>}` so multi-line stat targets can show bullet lists; arrow enabled by default. |
| Config summary metadata (duplicates/metasets) | Native `title` | OS | Immediate | Various `Box` nodes inside the chip set `title` to faction names, metaset text, and glyph descriptors when icons replace text. |

### src/components/ClearIconButton.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Clear icon | MarkdownTooltip | Markdown | 250 ms | Optional `tooltip` prop routes through MarkdownTooltip and is disabled automatically when the button is disabled. |

### src/components/MetasetsDialog.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Move-up icon | MarkdownTooltip | Markdown | 250 ms | `metasetsMoveUp`. |
| Move-down icon | MarkdownTooltip | Markdown | 250 ms | `metasetsMoveDown`. |
| Visibility toggle | MarkdownTooltip | Markdown | 250 ms | Explains hidden vs visible metaset states. |
| Usage count chip | MarkdownTooltip | Markdown | 250 ms | Shows `metasetsUsesTooltip`. |
| Set select display | EllipsisTooltip | Markdown | 250 ms | Prevents the popper from opening unless the select label is truncated; `title` receives the joined set names. |

### src/components/SetTooltip.tsx & dependents
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Set descriptions (`WithSetTooltip`) | MUI `<Tooltip>` | JSX | enterDelay 180 ms | Used by `GridIconBox`, `TesterItemsGrid`, and `SetMenuSection` to render a JSX header + per-piece description for each set. |

### src/components/SetMenuSection.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Metaset note (icon grid view) | EllipsisTooltip | Markdown | 250 ms | Displays the comma-joined set names only when truncated. |
| Set icon rows | WithSetTooltip | JSX | enterDelay 180 ms | `showName` optionally prepends the human-readable set name in the tooltip header. |

### src/components/gear/GearSetsSelect.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Selected token summary | Native `title` | OS | Immediate | The renderValue span sets `title={text}` to expose the combined set/metaset names when clipped. |
| Metaset menu row (name) | EllipsisTooltip | Markdown | 250 ms | Ensures names with glyphs show a tooltip only when truncated. |
| Metaset set list | Native `title` | OS | Immediate | The caption below each metaset row assigns `title={joined}` so the full list is readable. |

### src/components/gear/GearFactionSelect.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Selected faction label | Native `title` | OS | Immediate | The `renderSelected` span exposes the full faction name via `title`. |

### src/components/EllipsisTooltip.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Overflow-only helper | MarkdownTooltip | Markdown/JSX | 250 ms | Used wherever we only want a tooltip if text is truncated (Builder set selects, Rules filter metasets, HsfRulesTable cells, etc.). |

### src/components/RulesFilterPanel.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| “Any” chips & glyph filters | MUI `<Tooltip>` | JSX | Default | Various chips (sets match mode, chaos ore, substat match mode, glyph filter, roll summary) pass JSX generated by `renderGlyphTooltip`. |
| Tester config filter button | MUI `<Tooltip>` | JSX | Default | Wraps the button with `testerConfigFilterTooltip`. |
| Preview config filter button | MUI `<Tooltip>` | JSX | Default | Shows `filterLimitPreviewConfigsTooltip`. |
| Slot icon toggles | MUI `<Tooltip>` | JSX | Default | Icon-only slot toggles use `<Tooltip title={s.name}>` with `placement="bottom"`. |
| Metaset menu entries | EllipsisTooltip + native `title` | Markdown/OS | 250 ms & immediate | Names use `EllipsisTooltip`, while the caption line sets a native `title={joined}`. |
| Rule/tester result toggles | Native `title` | OS | Immediate | All ToggleButtons (keep/sell, matched/unmatched, active/disabled) set `title` to the localized label. |
| Tester source toggles | Native `title` | OS | Immediate | `title={option.label}` on each source toggle. |
| Champion filter renderValue | Native `title` | OS | Immediate | Shows `t('any')` or the composed summary string. |
| Champion summary chips | Native `title` | OS | Immediate | Both the summary `Typography` and the flex container set `title` to `summaryTitle`. |
| Set selection renderValue | Native `title` | OS | Immediate | The multi-select summary span sets `title={text}` so full set/metaset token lists are readable. |
| Faction filter renderValue | Native `title` | OS | Immediate | Both empty (`t('any')`) and populated lists assign `title={summaryTitle}`. |
| Rarity toggles | Native `title` | OS | Immediate | Each rarity ToggleButton uses `title={t(labelKey)}` to expose the rarity name. |

### src/components/BuilderPanel.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Every FormLabel (Action, Rank, Rarity, Faction, Min/Max Level, Main/Substats, Slots, etc.) | MUI `<Tooltip>` | JSX | Default | Labels wrap `BuilderTooltipContent` strings, often combining helper lines and `builderMultiMixed*` hints. |
| Export Mode toggle labels | MUI `<Tooltip>` | JSX | Default | Each ToggleButton child uses `<Tooltip>` with placement `top`. |
| Undo/Redo buttons | MUI `<Tooltip>` | JSX | Default | Titles are `<BuilderTooltipContent>` snapshots, constrained to `HISTORY_TOOLTIP_MAX_WIDTH_PX`. |
| Builder Help icon | MUI `<Tooltip>` | JSX | Default | Simple string `t('builderHelpOpen')`. |
| Substat lock/unlock toggles in menu | MUI `<Tooltip>` | JSX | enterDelay 200 ms | Each lock toggle uses `BuilderTooltipContent` plus arrow + delay for clarity. |
| Roll target warning badge | MUI `<Tooltip>` | JSX | enterDelay 200 ms | Shows the computed warning text when roll targets regress. |
| Substat flex chip | MUI `<Tooltip>` | JSX | Default | Wraps the flex toggle chip with `builderSubstatFlexToggleTooltip`. |
| Auto thresholds chip | MUI `<Tooltip>` | JSX | Default | Shows `builderMilestoneThresholdsHelp`. |
| Rule history chip (red badge) | Native `title` | OS | Immediate | `Chip` showing total rules sets `title={limitWarningTooltip}` whenever a limit is exceeded. |
| Manage metasets button | Native `title` | OS | Immediate | `title={t('builderManageMetasetsButton')}` ensures the full label is accessible. |
| Faction icon in config summary | Native `title` | OS | Immediate | `Box component="span"` around the icon sets `title` to the faction label. |
| Save button text | Native `title` | OS | Immediate | `title={saveButtonLabel}` keeps the text exposed during animations. |
| Config add/save badges | MUI `<Tooltip>` | JSX | Default/forced | Insert/save buttons show `builderInsertHiddenTooltip` or `builderSaveHiddenTooltip`; the save button forces the tooltip open when hidden configs exist. |
| Sets Select summary (builder) | EllipsisTooltip | Markdown | 250 ms | Builder’s set/multi-select renderers wrap selects with `EllipsisTooltip` so popups appear only when truncated. |

### src/components/HsfRulesTable.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| Table headers | MUI `<Tooltip>` | JSX | Default | Each column label uses `rulesHeaderHelp` to describe its content. |
| Slot icon cells | MUI `<Tooltip>` | JSX | Default | When icons replace slot names we wrap them with `<Tooltip title={tooltipTitle}>`. |
| Faction glyphs | MUI `<Tooltip>` | JSX | Default | Shows the full faction name when only the crest is visible. |
| Substat summary chips | MUI `<Tooltip>` | JSX | Default | Delegates to `getSubstatTooltipSummary`. |
| Column visibility menu | MUI `<Tooltip>` | JSX | Default | Manage-colors & visibility toggles show hover help text. |
| Overflowed rule text | EllipsisTooltip | Markdown | 250 ms | Main rule descriptions and values use `EllipsisTooltip` with `wrap="block"` to show the full string only when necessary. |

### src/components/HistoryContextMenu.tsx
| Element | Implementation | Style | Custom Timing | Notes |
| --- | --- | --- | --- | --- |
| History entries | MUI `<Tooltip>` | JSX | Default | Each menu row uses `<BuilderTooltipContent>` (with stat colorization) and caps width via `slotProps`. |

### src/components/RulesFilterPanel.tsx (Context Menu Hint Overlay is tooltip-like but custom) – see entries above.

### src/components/gear/GearSetsSelect.tsx / gear/GearFactionSelect.tsx / TesterRuleReferenceChip.tsx – see respective sections.

### src/components/AppLayout/BuilderColumn.tsx / HeaderActions.tsx / FilePickerButton.tsx / ColorField.tsx – see sections above for OS tooltip usage.

### src/components/EllipsisTooltip.tsx / SetMenuSection.tsx / SetTooltip.tsx – shared helpers documented above.

## Verification
Every entry above was confirmed directly in the referenced source files. MarkdownTooltip instances all inherit the 250 ms enter delay unless stated otherwise, `WithSetTooltip` instances use `enterDelay=180 ms`, raw MUI `<Tooltip>` calls rely on the default Material UI timing (no overrides unless noted), and native `title` attributes surface immediate OS tooltips.
