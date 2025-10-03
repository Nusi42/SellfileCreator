/**
 * Centralized app-wide constants.
 *
 * Why: These values are used in multiple places and must remain consistent.
 * Centralizing avoids drift and clarifies intent without changing behavior.
 */

// Typography scale rooted at 16px (browser default). Why: collapse the UI to
// predictable tiers while keeping markdown legibility and badge sizing.
export const FONT_SIZE_HTML_BASE_PX = 16
export const FONT_SIZE_DISPLAY_REM = 2
export const FONT_SIZE_BASE_PX = 15
export const FONT_SIZE_BASE_REM = FONT_SIZE_BASE_PX / FONT_SIZE_HTML_BASE_PX
export const FONT_SIZE_TITLE_PX = 18
export const FONT_SIZE_TITLE_REM = FONT_SIZE_TITLE_PX / FONT_SIZE_HTML_BASE_PX
export const FONT_SIZE_HEADER_META_PX = 10
export const FONT_SIZE_HEADER_META_REM = FONT_SIZE_HEADER_META_PX / FONT_SIZE_HTML_BASE_PX
export const FONT_SIZE_SECONDARY_PX = 12
export const FONT_SIZE_SECONDARY_REM = FONT_SIZE_SECONDARY_PX / FONT_SIZE_HTML_BASE_PX
export const FONT_SIZE_BADGE_PX = 10
export const FONT_SIZE_MARKDOWN_PX = 16

export const SMALL_BUTTON_HEIGHT_PX = 28
export const BUILDER_STATUS_CHIP_HEIGHT_PX = 22

// Autosave storage key for HSFC sessions
export const AUTOSAVE_KEY = 'sellfileCreator.autosave.hsfc.v1'
// Autosave storage key for the Rule Tester dialog
export const AUTOSAVE_TESTER_KEY = 'sellfileCreator.autosave.tester.v1'

// Persisted toggle for coloring stat texts (chips/preview)
export const STAT_BUTTON_BORDERS_KEY = 'sellfileCreator.statButtonBorders.v1'

// Persisted color-blind mode for success/warning/error palette
// Values: 'normal' | 'colorblind' (extendable in the future without breaking storage)
export const COLOR_BLIND_MODE_KEY = 'sellfileCreator.colorBlindMode.v1'
// Supported palettes: 'normal' (default), 'okabeIto' (deuter/protan friendly), 'tritan' (tritanopia-friendly)
export type ColorBlindMode = 'normal' | 'okabeIto' | 'tritan'

// Non-breaking space for UI formatting (keeps labels glued to following token)
export const NBSP = '\u00A0'

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
export const CHIP_ROLL_BADGE_FONT_SIZE_PX = FONT_SIZE_BADGE_PX

// Layout widths (see docs/TECHNICAL.md)
export const PANEL_WIDTH_PX = 1152
export const SIDE_BY_SIDE_BREAKPOINT_PX = 2320
export const GRID_COLUMN_GAP_PX = 16

// Shared UI transitions
export const UI_BG_TRANSITION = 'background-color 220ms ease-in-out 60ms'
// Immediate hover-danger background transition (no delay) used for red-tint
// highlights like Delete/Reset hover. Kept separate so general fades can
// remain slightly delayed while danger cues feel snappy.
export const UI_BG_HOVER_DANGER_TRANSITION = 'background-color 180ms ease-out 0ms'

// Shared hover highlight opacities (light vs dark mode). Used across config chips
// and the HSF preview so the states remain visually aligned without duplicating
// magic numbers in component styles.
export const HOVER_BG_ALPHA = {
  light: 0.1,
  dark: 0.2,
} as const
export const SELECTED_HOVER_BG_ALPHA = {
  light: 0.2,
  dark: 0.4,
} as const

// Hide-tooltips debounce while scrolling
// Why: MUI Tooltip/Popper can trigger transient viewport scrollbars while
// scrollable containers move. We add a short-lived body class to hide all
// tooltips during active scroll interactions for visual stability.
export const SCROLLING_TOOLTIP_HIDE_MS = 250

// Compact reserved height for the Substats warning row in the Builder
// Why: Keep a stable layout (no shift when warnings appear) while minimizing
// wasted space between "Required substats" and "Sets".
export const UI_SUBSTAT_WARNING_ROW_HEIGHT_PX = 14

// File picker accept strings
export const ACCEPT_HSF = '.hsf,application/json'
export const ACCEPT_HSFC = '.hsfc,application/json'

// Persisted UI language (i18n). Supported production codes: 'en-US' | 'de-DE' | 'fr-FR' | 'es-ES' | 'pt-BR' | 'pt-PT' | 'ru-RU' | 'uk-UA' | 'tr-TR'.
// Dev builds can additionally select 'empty' to surface untranslated strings.
// Why: Keep language selection stable across sessions and avoid magic strings.
export const LANG_KEY = 'sellfileCreator.lang.v1'

// Context/menu control sizing
// Why: Toggle/Button variants (contained vs outlined, selected vs not) can differ by a border/padding pixel,
// which causes the menu item height to jump when toggled. We pin controls to a fixed height so
// the header context menu layout remains stable while switching states.
export const MENU_CONTROL_HEIGHT_PX = 28
export const MENU_CONTROL_MIN_WIDTH_PX = 120
// Fixed label width for header context menu items. Ensures translations (e.g., German)
// wrap instead of expanding the menu paper width.
export const MENU_LABEL_WIDTH_PX = 140
// Fixed width for the Final Sell toggle to avoid layout shifts when the label changes
export const FINAL_SELL_BUTTON_WIDTH_PX = 160
// Shared max width for long button labels that should ellipsize instead of growing indefinitely.
// Why: Translations can easily exceed the English length (e.g., Spanish “Cargar Sellfile…”)
// and would otherwise push sibling controls off screen. Buttons using this limit must apply
// `ELLIPSIS_TEXT_SX` to their label element so truncated text remains readable.
export const LONG_LABEL_BUTTON_MAX_WIDTH_PX = 240
// Compact max width for color chip buttons inside the Manage Colors dialog. Keeps the swatch +
// label on one line without letting long translations (e.g., German “Hintergrund”) stretch the row.
export const COLOR_FIELD_BUTTON_MAX_WIDTH_PX = 144
// Reusable ellipsis style for inline text elements (typically button labels) that need to clamp to a
// single line while remaining accessible via title/tooltips.
export const ELLIPSIS_TEXT_SX = {
  display: 'inline-block',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

// Fixed width for the Builder "Add/Insert" button so the layout does not
// shift when the label changes between states (Add vs Insert).
export const BUILDER_ADD_BUTTON_WIDTH_PX = 260

// Builder slot labels use the longest localized string to reserve space so all
// slot icons line up consistently regardless of translation length. A small
// buffer keeps the text from hugging the measurement edge.
export const BUILDER_SLOT_LABEL_WIDTH_BUFFER_PX = 4

// Shared height for builder toggle groups and aligned controls.
export const BUILDER_TOGGLE_BUTTON_HEIGHT_PX = 36
// Minimum width for individual stat toggle buttons so labels stay legible.
export const BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX = 88
// Wider width for the "Any" toggle to balance against the grid of stat toggles.
export const BUILDER_TOGGLE_BUTTON_ANY_MIN_WIDTH_PX = BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX * 3 / 2
// Idle gutter for substat toggles; shrinks the placeholder columns when no roll
// badge is visible so long labels (e.g., CDMG%) avoid clipping without widening
// the entire button. Selected/hover states restore the full badge gutter.
export const BUILDER_SUBSTAT_IDLE_GUTTER_PX = ROLL_BADGE_SIZE_PX - 4

// Idle nudge for dirty builder state before prompting attention on the
// "Save changes to selected" control. Expressed as seconds × 1000 to
// preserve intent and make adjustments safer.
export const BUILDER_DIRTY_NUDGE_IDLE_MS = 300 * 1000
// While in the attention phase, how often to replay a suite effect burst
export const BUILDER_DIRTY_ATTENTION_INTERVAL_MS = 15 * 1000

// Final-sell level milestones and defaults
// Why: These values are used in multiple places (UI, merge/export, HSFC defaults)
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

// Rarity UI label for automatic resolution (HSFC writes this label; HSF export
// always uses a concrete rarity code). Keeping it centralized avoids string
// drift across IO and UI.
export const RARITY_AUTO_LABEL = 'Auto'

// Preview table display preferences
// Why: Keep user choices consistent across sessions without affecting other
// app storage. Versioned to allow changing defaults without migrations.
export const RULES_TABLE_SHOW_SLOT_ICONS_KEY = 'sellfileCreator.rulesTable.slotIcons.v2'
export const RULES_TABLE_SHOW_SET_ICONS_KEY = 'sellfileCreator.rulesTable.setIcons.v2'
export const RULES_TABLE_SHOW_FACTION_ICONS_KEY = 'sellfileCreator.rulesTable.factionIcons.v1'

// Fixed width for Faction Select in the Rules filter
// Why: Keep the input width stable regardless of selected label lengths,
// matching the visual footprint of the Builder's Faction selector.
export const FILTER_FACTION_SELECT_WIDTH_PX = 260
// Fixed width for Sets Select in the Rules filter (top-row next to Rule)
// Why: Keep Rule wide and Sets compact to avoid a 50/50 split while preserving readability.
export const FILTER_SETS_SELECT_WIDTH_PX = 320

// Fixed width for compact toggle buttons in the Rules filter (Keep/Sell, Enabled/Disabled).
// Why: Match the English layout footprint while allowing longer translations to ellipsize.
export const FILTER_TOGGLE_BUTTON_WIDTH_PX = 72

// Top margin above filter chips to provide clear separation from controls above.
// Expressed in theme spacing units to integrate with MUI spacing scale.
export const FILTER_CHIP_TOP_MARGIN = 0.5

// Unified dimming for compact filter chips in the Rules filter panel
// Why: Keep these helper chips visually secondary to the primary toggle
// controls, while still readable. Centralized to maintain consistency.
export const FILTER_CHIP_OPACITY = 0.75

// Rules table virtualization overscan
// Why: The HSF rules table renders a window of rows around the viewport.
// Overscan is the buffer of off-screen rows rendered above/below the view.
// Smaller during fast scrolling to reduce per-frame work; larger when idle
// for smoother edges with fewer pop-ins.
export const RULES_TABLE_OVERSCAN_FAST = 6
export const RULES_TABLE_OVERSCAN_IDLE = 50

// Rules table scroll behavior
// Nearby threshold for deciding when to use smooth scrolling in single-line mode.
// Expressed as a multiple of the current viewport height to preserve intent
// across different window sizes. When the target row is farther than this
// threshold, we jump instantly to avoid long smooth animations.
export const RULES_TABLE_SMOOTH_SCROLL_NEARBY_VIEWPORTS = 1.5

// Throttle for propagating hover from the preview table to the chips panel
// Why: Rapid hover updates across thousands of rows can cause frequent
// top-level re-renders (App) when linking chip highlights. We keep the
// table’s own row highlight immediate and propagate to App at most once per
// frame to keep interactions snappy without jank.
export const RULES_TABLE_HOVER_PROPAGATION_MS = 32

// Tooltip keywords
// Why: Keep UI-only keyword lists with other UI constants. These power
// simple highlighting inside set/tooltips and do not affect rule logic.
export const BUFF_KEYWORDS = [
  'Block Debuffs',
  'Unkillable',
  'Block Damage',
  'Stone Skin',
  'Protected',
  'Shield',
] as const

export const DEBUFF_KEYWORDS = [
  'Hex',
  'Sleep',
  'Stun',
  'Freeze',
  'Provoke',
  'Fear',
  'True Fear',
  'Weaken',
  'Poison',
  'Decrease ATK',
  'Decrease DEF',
  'Decrease SPD',
  'Decrease ACC',
  'Decrease C.RATE',
  'Block Buffs',
  'Block Active Skills',
] as const

// Temporary easter‑egg trigger chance for the circled "42" overlay in the Builder
// Why: Keep the probability adjustable in one place while we iterate on UX.
// Only used by the BuilderPanel; isolated here to avoid magic numbers in UI code.
export const EASTER_EGG_42_CHANCE = 0.042
// Display duration for the overlay in milliseconds. Expressed as seconds × 1000
// to preserve intent and make later adjustments safer.
// Longer duration to better showcase the animation
export const EASTER_EGG_42_DURATION_MS = 4200

// Rule Tester layout sizing
// Fixed width for a single substat editor (variant + steppers + value field).
// Slightly narrower to reduce unused space after the + button while keeping
// a stable two‑column grid across locales and label lengths.
export const TESTER_SUBSTAT_EDITOR_WIDTH_PX = Math.round(320 * 0.84)
// Reserved width for the per-row control column (add/remove buttons) in the
// Rule Tester so substats/results align with the first selector (slot).
export const TESTER_ROW_CONTROLS_WIDTH_PX = 56
// Fixed min-widths for selects inside Rule Tester (slightly narrower for better fit)
// Keep these centralized to avoid magic numbers and ensure consistent sizing.
// Reduced by ~15% for tighter layout
// Reduced by another 3% for a tighter layout while keeping readability.
// Keep as a calculation to preserve intent for future tuning.
// Reduce a bit further to improve fit in the tester row
export const TESTER_MAINSTAT_SELECT_MIN_WIDTH_PX = 125
export const TESTER_SUBSTAT_SELECT_MIN_WIDTH_PX = 125
// Fixed widths so Select content changes don't shift layout
// Shared width keeps the slot and set selectors perfectly aligned across rows.
const TESTER_SLOT_SET_COLUMN_WIDTH_PX = Math.round(200 * 1.10)
export const TESTER_SLOT_SELECT_WIDTH_PX = TESTER_SLOT_SET_COLUMN_WIDTH_PX
export const TESTER_SET_SELECT_WIDTH_PX = TESTER_SLOT_SET_COLUMN_WIDTH_PX
export const TESTER_FACTION_SELECT_WIDTH_PX = 180
export const TESTER_RANK_SELECT_WIDTH_PX = 90
// Rarity column mirrors faction width so the two rows stay aligned.
export const TESTER_RARITY_SELECT_WIDTH_PX = TESTER_FACTION_SELECT_WIDTH_PX
export const TESTER_LEVEL_SELECT_WIDTH_PX = 90
// Uniform Select height for Rule Tester controls
export const TESTER_SELECT_HEIGHT_PX = 40

// Sentinel for accessories that do not belong to any set (e.g., base banners/rings/amulets).
// Shared by the Rule Tester and Final Sell remainder rules so no-set accessories are matched.
export const ACCESSORY_NO_SET_ID = 0

// Special ID used only by the Rule Tester for "Any slot" (no slot restriction).
// Semantics: Matches only HSF rules whose ArtifactType is Any (empty list);
// rules that restrict to specific slots do not match this sentinel.
export const TESTER_ANY_SLOT_ID = 0

// Minimum height for the Rule Tester result row so layout does not shift
// when switching between a detailed match (chip + text + button) and the
// compact "No match" text. Chosen to comfortably fit a small Chip and a
// small Button in a single line.
export const TESTER_RESULT_ROW_MIN_HEIGHT_PX = 36

// Maximum width for the Rule Tester config chip before truncating with ellipsis.
// Chosen to balance long names without forcing the row to wrap unexpectedly.
export const TESTER_CONFIG_CHIP_MAX_WIDTH_PX = 350

// Fixed dimensions for the Rule Tester dialog so its layout remains predictable.
// Width is trimmed below the previous 1120px cap for a tighter footprint; height
// keeps the content scrollable without overwhelming shorter displays.
export const TESTER_DIALOG_WIDTH_PX = 850
export const TESTER_DIALOG_HEIGHT_PX = 780
// Virtualization heuristics keep the tester responsive even with many expanded rows.
export const TESTER_VIRTUAL_OVERSCAN_PX = 320
export const TESTER_ROW_ESTIMATE_COMPACT_PX = 180
export const TESTER_ROW_ESTIMATE_EXPANDED_PX = 420
// Shared inline icon size for Rule Tester compact chips.
// Keeps slot/set/faction icons from hitting the chip border while staying recognizable.
export const TESTER_COMPACT_ICON_SIZE_PX = 16
// Extra padding applied to compact chips that render icons; tuned high right now
// while validating spacing. Reduce once the desired inset is confirmed visually.
export const TESTER_COMPACT_ICON_LEFT_PADDING_PX = 5
