/**
 * Centralized app-wide constants.
 *
 * Why: These values are used in multiple places and must remain consistent.
 * Centralizing avoids drift and clarifies intent without changing behavior.
 */

// Autosave storage key for HSFR sessions
export const AUTOSAVE_KEY = 'sellfileCreator.autosave.hsfr.v1'

// Persisted toggle for coloring stat texts (chips/preview)
export const STAT_BUTTON_BORDERS_KEY = 'sellfileCreator.statButtonBorders.v1'

// Persisted substat color map (v5 schema)
export const COLORS_STORAGE_KEY_V5 = 'sellfileCreator.substatColors.v5'

// UI sizing constants for roll indicators in the builder
export const ROLL_BADGE_SIZE_PX = 16
export const ROLL_BADGE_HOVER_GUTTER_PX = 6
// Visual scale multiplier for the roll indicator circle.
// Why: Make the circle easier to click without changing layout widths.
// We keep the underlying grid/gutters the same size and enlarge the
// circle via CSS transform so labels remain unaffected.
export const ROLL_BADGE_SCALE = 1.35

// Config chip substat roll indicator sizing (hollow circle)
// Why: Keep the chip indicator legible and consistently sized; centralized to
// make future tuning safe without hunting for magic numbers.
export const CHIP_ROLL_BADGE_SIZE_PX = 15
export const CHIP_ROLL_BADGE_FONT_SIZE_PX = 10

// Layout widths (see docs/TECHNICAL.md)
export const PANEL_WIDTH_PX = 1152
export const SIDE_BY_SIDE_BREAKPOINT_PX = 2320
export const GRID_COLUMN_GAP_PX = 16

// Shared UI transitions
export const UI_BG_TRANSITION = 'background-color 220ms ease-in-out 60ms'

// Compact reserved height for the Substats warning row in the Builder
// Why: Keep a stable layout (no shift when warnings appear) while minimizing
// wasted space between "Required substats" and "Sets".
export const UI_SUBSTAT_WARNING_ROW_HEIGHT_PX = 14

// File picker accept strings
export const ACCEPT_HSF = '.hsf,application/json'
export const ACCEPT_HSFR = '.hsfr,application/json'

// Context/menu control sizing
// Why: Toggle/Button variants (contained vs outlined, selected vs not) can differ by a border/padding pixel,
// which causes the menu item height to jump when toggled. We pin controls to a fixed height so
// the header context menu layout remains stable while switching states.
export const MENU_CONTROL_HEIGHT_PX = 28
export const MENU_CONTROL_MIN_WIDTH_PX = 120
// Fixed width for the Final Sell toggle to avoid layout shifts when the label changes
export const FINAL_SELL_BUTTON_WIDTH_PX = 160

// Fixed width for the Builder "Add/Insert" button so the layout does not
// shift when the label changes between states (Add vs Insert).
export const BUILDER_ADD_BUTTON_WIDTH_PX = 260

// Idle nudge for dirty builder state before prompting attention on the
// "Save changes to selected" control. Expressed as seconds × 1000 to
// preserve intent and make adjustments safer.
export const BUILDER_DIRTY_NUDGE_IDLE_MS = 300 * 1000
// While in the attention phase, how often to replay a suite effect burst
export const BUILDER_DIRTY_ATTENTION_INTERVAL_MS = 15 * 1000

// Final-sell level milestones and defaults
// Why: These values are used in multiple places (UI, merge/export, HSFR defaults)
// and must remain consistent. Centralizing avoids drift and keeps intent clear.
export const FINAL_SELL_LEVEL_MILESTONES = [0, 4, 8, 12, 16] as const
export const FINAL_SELL_DEFAULT_LEVELS = [0, 4, 8, 12] as const

// Sets order toggle sizing (kept consistent across builder and dialog)
// Why: Ensure all three order buttons (Game / A–Z / Icons) have the same
// size to prevent wrapping and jank when space is tight. Compact but readable.
export const SETS_ORDER_TOGGLE_SIZE_PX = 28

// Persisted sets order/display mode for the Sets selector
// Values: 'icons' | 'game' | 'az'
export const SETS_ORDER_KEY = 'sellfileCreator.setsOrder.v1'

// Shared style for MUI ListSubheader inside menus
// Why: Keep header typography consistent (normal font size) but compact
// height for dense menus. Centralized to avoid drift across files.
export const LIST_SUBHEADER_SX = {
  opacity: 0.7,
  py: 0,
  my: 0,
  lineHeight: 2,
} as const
// Min height for menu/list headers that include the "Search Sets" input so the
// floating label has enough vertical room when focused (shrink state)
export const MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX = 42
// Max heights for scrollable sections inside the Sets Select menu
// Why: Keep both Metasets and Sets visible longer; icons grid aims for ~8 rows.
export const MENU_MAX_HEIGHT_METASETS_PX = 400
// Max/fixed heights for Sets section in the Select menu
// Use a smaller height for the compact icon grid to avoid large empty areas,
// and a taller height for list modes to show more items while keeping the
// header controls stationary when toggling modes.
export const MENU_MAX_HEIGHT_SETS_ICONS_PX = 200
export const MENU_MAX_HEIGHT_SETS_LIST_PX = 300

// Extra right padding inside scrollable menu sections to keep right-edge
// hover markers visible in browsers with overlay scrollbars.
export const MENU_SCROLL_GUTTER_PX = 8

// Selected background opacity for menu items (metasets and sets), applied via
// alpha(theme.palette.primary.main, ...). Kept centralized to ensure the same
// tone across Builder and Metasets dialog and all display modes.
export const MENU_SELECTED_BG_ALPHA = 0.24
export const MENU_SELECTED_BG_HOVER_ALPHA = 0.30

// Extra buffer that prevents a flicker; it compensates for an extra height whose source
// has not been identified, so this is an empirical workaround.
export const MENU_MAX_HEIGHT_EXTRA_BUFFER = 90

// Fixed width for the Sets select menu popover paper
// Why: Keep the menu width stable while toggling between Icons/Game/A–Z
// modes and when scrollbars appear, avoiding layout jank. Used in both the
// Builder and Metasets dialog.
// Slightly wider to accommodate 15 icon columns plus scrollbar gutter
export const SETS_MENU_WIDTH_PX = 540

// Marks the README version the user has seen. When APP_VERSION differs,
// the app shows the README on startup to highlight current behavior.
export const README_SEEN_VERSION_KEY = 'sellfileCreator.readme.seen.version'

// Marks whether the interactive tutorial has been seen for this app version.
// Why: Show the guided walkthrough on first run to onboard users, but avoid
// re-opening it every time. Tied to APP_VERSION like README gating so new
// versions can introduce updated tutorials when needed.
export const TUTORIAL_SEEN_VERSION_KEY = 'sellfileCreator.tutorial.seen.version'
// User-configurable default builder profile storage key. When present, the
// builder's "Reset to defaults" uses this profile; otherwise it uses factory
// defaults. Removing this key restores factory default behavior.
export const BUILDER_USER_DEFAULTS_KEY = 'sellfileCreator.builder.userDefaults.v1'

// Builder: when enabled, resets the builder controls to defaults immediately
// after inserting a config (no confirmation). Default Off. Persisted here so
// the behavior is stable across sessions.
export const BUILDER_AUTO_RESET_AFTER_INSERT_KEY = 'sellfileCreator.builder.autoResetAfterInsert.v1'

// Rarity UI label for automatic resolution (HSFR writes this label; HSF export
// always uses a concrete rarity code). Keeping it centralized avoids string
// drift across IO and UI.
export const RARITY_AUTO_LABEL = 'Auto'
