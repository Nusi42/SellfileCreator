/**
 * Centralized app-wide constants.
 *
 * Why: These values are used in multiple places and must remain consistent.
 * Centralizing avoids drift and clarifies intent without changing behavior.
 */
import {
  ACCESSORY_NO_SET_ID as GENERATED_ACCESSORY_NO_SET_ID,
  SUBSTAT_MAX_ROLLS_PER_SLOT as GENERATED_SUBSTAT_MAX_ROLLS_PER_SLOT,
} from './generated/domainConstants'

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
// Subtitle size for the "for RSL Helper" tagline in the app header and help dialog.
export const FONT_SIZE_APP_SUBTITLE_PX = 14
export const FONT_SIZE_SECONDARY_PX = 12
export const FONT_SIZE_SECONDARY_REM = FONT_SIZE_SECONDARY_PX / FONT_SIZE_HTML_BASE_PX
export const FONT_SIZE_BADGE_PX = 10
export const FONT_SIZE_MARKDOWN_PX = 16

export const SMALL_BUTTON_HEIGHT_PX = 28
// Shared width for compact header action buttons so labels align across panels.
export const COMPACT_HEADER_ACTION_BUTTON_WIDTH_PX = 92
// Shared baseline sizing for compact header actions (with or without chevrons).
export const COMPACT_HEADER_ACTION_BUTTON_BASE_SX = {
  // Compact horizontal padding keeps labels readable without widening the button.
  px: 1.25,
  // Fixed height aligns with other small controls across the UI.
  height: SMALL_BUTTON_HEIGHT_PX,
  minHeight: SMALL_BUTTON_HEIGHT_PX,
  // Clamp long labels while keeping the button center-aligned.
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  // Remove vertical padding so the height remains exact.
  py: 0,
  // Prevent wrapping in narrow layouts.
  whiteSpace: 'nowrap',
} as const
// Shared button sizing for compact outlined actions (Sort/Tags) to keep shapes consistent.
export const COMPACT_HEADER_ACTION_BUTTON_SX = {
  ...COMPACT_HEADER_ACTION_BUTTON_BASE_SX,
  // Fixed width prevents layout shift as labels change.
  minWidth: COMPACT_HEADER_ACTION_BUTTON_WIDTH_PX,
  width: COMPACT_HEADER_ACTION_BUTTON_WIDTH_PX,
  maxWidth: COMPACT_HEADER_ACTION_BUTTON_WIDTH_PX,
} as const
export const SELLFILE_BUTTON_HEIGHT_PX = SMALL_BUTTON_HEIGHT_PX + 8
export const BUILDER_STATUS_CHIP_HEIGHT_PX = 22
export const STATUS_CHIP_BORDER_RADIUS_PX = 8

// Autosave storage key for SFR sessions
export const AUTOSAVE_KEY = 'sellfileCreator.autosave.sfr.v1'
// Autosave storage key for the Gear Inspector dialog item queue
export const AUTOSAVE_GEAR_INSPECTOR_KEY = 'sellfileCreator.autosave.gearInspector.v1'
// Persisted Sellfile Preview / Gear Inspector toggle selection
export const PREVIEW_MODE_STORAGE_KEY = 'sellfileCreator.previewMode.v1'
// Persisted Recipe Builder / Safeguard Builder toggle selection
export const BUILDER_MODE_STORAGE_KEY = 'sellfileCreator.builderMode.v1'
// Persisted toggle for coloring stat texts (chips/preview)
export const STAT_BUTTON_BORDERS_KEY = 'sellfileCreator.statButtonBorders.v1'
// Persisted safeguards grid filter toggle.
export const SAFEGUARDS_GRID_FILTER_KEY = 'sellfileCreator.safeguards.gridFilter.v1'
// Persisted safeguards grid column count.
export const SAFEGUARDS_GRID_COLUMNS_KEY = 'sellfileCreator.safeguards.gridColumns.v1'
// Persisted Dungeon Drops simulator selections (mode, stage, spotlight set).
export const DUNGEON_SIM_PREFERENCES_KEY = 'sellfileCreator.dungeonDrops.v1'

// Persisted color-blind mode for success/warning/error palette
// Values: 'normal' | 'colorblind' (extendable in the future without breaking storage)
export const COLOR_BLIND_MODE_KEY = 'sellfileCreator.colorBlindMode.v1'
// Supported palettes: 'normal' (default), 'okabeIto' (deuter/protan friendly), 'tritan' (tritanopia-friendly)
export type ColorBlindMode = 'normal' | 'okabeIto' | 'tritan'

// Non-breaking space for UI formatting (keeps labels glued to following token)
export const NBSP = '\u00A0'
// Rightward arrow glyph for diff/rename summaries across the UI.
export const GLYPH_ARROW_RIGHT = '→'
export const GLYPH_TOGGLE_ON = '⦿'
export const GLYPH_TOGGLE_OFF = '⭘'
export const GLYPH_GLYPHS_SELECTED = '✓'
// Per-dimension count glyphs — each scope gets a distinct colored emoji shown iff the flag is on.
// When the selection for that dimension is empty (any), ∀ is appended to signal "every".
export const GLYPH_PER_SLOT = '🔲'     // black square button — slot/grid position
export const GLYPH_PER_FACTION = '🚩'  // triangular flag — faction banner
export const GLYPH_PER_MAIN_STAT = '⭐' // star — primary stat marker
export const GLYPH_PER_SET = '🎯'      // direct hit/bullseye — set collection target
export const GLYPH_PER_SUBSTAT = '➕'  // heavy plus — secondary stat addition
export const GLYPH_FOR_ALL = '∀'        // "every" indicator for empty (any) selections
// Ignore-option chip glyphs — shown on the three ignore toggle chips.
export const GLYPH_IGNORE_PREVIOUS = '⏩'    // skip/bypass previous safeguard results
export const GLYPH_IGNORE_COLLECTION = '🏆'  // gear worn by collection champions
export const GLYPH_IGNORE_VAULT = '🏦'       // gear worn by vault champions
export const GLYPH_IMPROVEMENT_CHANCE = '📈'     // improvement-chance threshold chip
// Substat match chip glyphs — one per mode option.
export const GLYPH_SUBSTAT_ANY = '🔀'  // any one selected substat qualifies
export const GLYPH_SUBSTAT_ALL = '🔗'  // all selected substats must be present

// Persisted substat color map (v6 schema with alpha support)
export const COLORS_STORAGE_KEY_V6 = 'sellfileCreator.substatColors.v6'

// UI sizing constants for roll indicators in the builder
export const ROLL_BADGE_SIZE_PX = 16
export const ROLL_BADGE_HOVER_GUTTER_PX = 6
// Visual scale multiplier for the roll indicator circle.
// Why: Make the circle easier to click without changing layout widths.
// We keep the underlying grid/gutters the same size and enlarge the
// circle via CSS transform so labels remain unaffected.
export const ROLL_BADGE_SCALE = 1.35

// Recipe chip substat roll indicator sizing (hollow circle)
// Why: Keep the chip indicator legible and consistently sized; centralized to
// make future tuning safe without hunting for magic numbers.
export const CHIP_ROLL_BADGE_SIZE_PX = 15
export const CHIP_ROLL_BADGE_FONT_SIZE_PX = FONT_SIZE_BADGE_PX
export const RECIPE_CHIP_BORDER_RADIUS_PX = 8
export const RECIPE_CHIP_VERTICAL_PADDING_PX = 3
export const RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX = 26
// Layout widths (see docs/TECHNICAL.md)
export const PANEL_WIDTH_PX = 1152
export const SIDE_BY_SIDE_BREAKPOINT_PX = 2320
export const GRID_COLUMN_GAP_PX = 16
// Preview paper padding (theme spacing units).
export const PREVIEW_PAPER_PADDING_UNITS = 2
// Fixed zoom applied when we force side-by-side on desktops slightly narrower than the breakpoint.
export const AUTO_SIDE_BY_SIDE_FORCED_ZOOM = 0.81
// Only force the zoom when the viewport is wide enough that the fixed zoom will still fit both panels.
export const AUTO_SIDE_BY_SIDE_FORCE_MIN_WIDTH_PX = Math.ceil(SIDE_BY_SIDE_BREAKPOINT_PX * AUTO_SIDE_BY_SIDE_FORCED_ZOOM)

// Rule count safeguard: stop asynchronous counting once emission attempts to exceed this many rules.
// Extremely broad recipes can explode into millions of permutations and stall the worker.
// We surface a "≥ limit" hint instead of blocking the UI indefinitely.
export const RULE_COUNT_LIMIT = 35_000

// Global preview safeguard: cap the combined base + custom builder rules rendered at once.
// Final Sell remainder rows are exempt so the toggle always reflects user intent.
export const TOTAL_RULE_COUNT_LIMIT = 150_000

// Safeguard rule metadata: assign RecipeID values at or below this sentinel so they never collide
// with builder-generated recipes (which map to positive IDs).
export const SAFEGUARD_RECIPE_ID_BASE = -1 as const

// Recipe chips (builder) height caps
// Why: Keep the stack layout compact in single-column mode while letting the
// chips section stretch toward the viewport bottom whenever the wide
// side-by-side layout is active.
export const BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX = 300
export const BUILDER_RECIPE_CHIPS_EMPTY_MIN_HEIGHT_PX = 340
export const BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX = 3 * 8
export const BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_SAFE_GAP_PX = 12
// Minimum usable height for the safeguard rule chip list before the list stops
// shrinking further. Intentionally below the recipe default so the builder form
// dominates the available space when both panels are visible.
export const BUILDER_SAFEGUARD_CHIPS_MIN_HEIGHT_PX = 150

// Shared UI transitions
export const UI_BG_TRANSITION = 'background-color 220ms ease-in-out 60ms'
// Immediate hover-danger background transition (no delay) used for red-tint
// highlights like Delete/Reset hover. Kept separate so general fades can
// remain slightly delayed while danger cues feel snappy.
export const UI_BG_HOVER_DANGER_TRANSITION = 'background-color 180ms ease-out 0ms'
// Shared tinted background used for destructive hover states (e.g., Reset buttons).
// Keep values centralized so all danger cues stay visually consistent across panels.
export const DANGER_TINT_BG = {
  light: 'rgba(244,67,54,0.04)',
  dark: 'rgba(244,67,54,0.08)',
} as const

// Shared hover highlight opacities (light vs dark mode). Used across recipe chips
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
// Shared diagonal hatch alpha for "mixed" tri-state UI cues during multi-edit.
// Why: Keep partial selections readable without overpowering confirmed selections.
export const MULTI_EDIT_MIXED_BG_ALPHA = {
  light: 0.12,
  dark: 0.08,
} as const

export const MULTI_EDIT_MIXED_BORDER_ALPHA = {
  light: 0.28,
  dark: 0.45,
} as const

export const MULTI_EDIT_MIXED_TEXT_ALPHA = {
  light: 0.6,
  dark: 0.75,
} as const

// Hide-tooltips debounce while scrolling
// Why: MUI Tooltip/Popper can trigger transient viewport scrollbars while
// scrollable containers move. We add a short-lived body class to hide all
// tooltips during active scroll interactions for visual stability.
export const SCROLLING_TOOLTIP_HIDE_MS = 250
// Explanatory tooltips attached to passive text use the shared hover delay.
export const MARKDOWN_TOOLTIP_INFO_ENTER_DELAY_MS = 1500
// Interactive controls keep a separate constant so behavior can diverge later if needed.
export const MARKDOWN_TOOLTIP_INTERACTIVE_ENTER_DELAY_MS = 1500
// Consistent width cap for MarkdownTooltip content so longer translations wrap
// gracefully without spanning the entire viewport.
export const MARKDOWN_TOOLTIP_MAX_WIDTH_PX = 520

// File picker accept strings
export const GEAR_DB_FILE_EXTENSIONS = ['.db', '.sqlite', '.sqlite3'] as const
const IMPORTABLE_FILE_EXTENSIONS = [
  '.hsf',
  '.sfr',
  '.hsfc',
  '.gearsets',
  '.gearsets.json',
  '.l10n',
  '.l10n.json',
  '.i18n.json',
  ...GEAR_DB_FILE_EXTENSIONS,
  'application/json',
] as const
export const ACCEPT_HSF = IMPORTABLE_FILE_EXTENSIONS.join(',')
export const ACCEPT_SFR = ACCEPT_HSF
export const ACCEPT_SFR_FILE_DIALOG = '.sfr,.hsfc'
export const ACCEPT_HSF_OR_DB_FILE_DIALOG = [
  '.hsf',
  ...GEAR_DB_FILE_EXTENSIONS,
].join(',')
// Default RSL Helper config path on Windows (referenced in UI copy hints and scripts)
export const RSL_HELPER_CONFIG_PATH = '%APPDATA%\\RslHelper\\Config'

// Persisted UI language (i18n). Supported codes live in src/lib/i18n/types.ts so tooling and UI stay in sync.
// Dev builds can additionally select the audit language to surface untranslated strings.
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
export const MENU_LABEL_WIDTH_PX = 176
// Final Sell toggles clamp to this width range so translations stay on one line.
export const FINAL_SELL_BUTTON_MIN_WIDTH_PX = 104
export const FINAL_SELL_BUTTON_WIDTH_PX = 138
// Shared max width for long button labels that should ellipsize instead of growing indefinitely.
// Widened so lengthy translations (e.g., German merged-sellfile export) can render without truncation
// while staying inside the available header space.
export const LONG_LABEL_BUTTON_MAX_WIDTH_PX = 420
// Maximum width for the filter header notice above the Sellfile Preview controls.
// Why: Let lengthy translations stay on one line without squeezing the surrounding controls.
export const FILTER_HEADER_LABEL_MAX_WIDTH_PX = 460
// Maximum width for the container that holds the filter header notice + toggle buttons.
// Why: Provide enough room for the notice and keep the button group aligned even with long strings.
export const FILTER_HEADER_CONTAINER_MAX_WIDTH_PX = 540
// Compact max width for color chip buttons inside the Manage Colors dialog. Keeps the swatch +
// label on one line without letting long translations (e.g., German “Hintergrund”) stretch the row.
export const COLOR_FIELD_BUTTON_MAX_WIDTH_PX = 144
// Gear Inspector recipe chips (matches + overflow) stay tap-friendly by enforcing a shared minimum width.
export const MATCHING_RECIPE_CHIP_MIN_WIDTH_PX = 50
// Reusable ellipsis style for inline text elements (typically button labels) that need to clamp to a
// single line while remaining accessible via title/tooltips.
export const ELLIPSIS_TEXT_SX = {
  display: 'inline-block',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

// Standard dialog padding matches the Metasets/Substat dialogs (16px block, 24px inline).
export const STANDARD_DIALOG_PADDING_INLINE_UNITS = 3
export const STANDARD_DIALOG_PADDING_BLOCK_UNITS = 2

// Labels next to inline controls lean on this helper so translations hit an ellipsis
// instead of stretching the row or wrapping under the control.
export const BUILDER_LABEL_INLINE_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  minWidth: 0,
  maxWidth: '100%',
} as const

// Label text inherits the ellipsis treatment; splitting the style lets us drop it on spans.
export const BUILDER_LABEL_TEXT_SX = {
  ...ELLIPSIS_TEXT_SX,
  display: 'block',
  minWidth: 0,
} as const

// Mirror the English layout widths for the Min Required / Required / Milestone trio so
// other locales preserve the same proportions without wrapping their controls.
export const BUILDER_MIN_ROLLS_COLUMN_WIDTH_PX = 224
export const BUILDER_REQUIRED_SUBSTATS_COLUMN_WIDTH_PX = 135
export const BUILDER_MILESTONE_THRESHOLDS_COLUMN_WIDTH_PX = 146
// Fixed width for builder "Auto" toggle buttons so translations stay aligned with numeric chips.
export const BUILDER_AUTO_TOGGLE_WIDTH_PX = 46

// Default recipe number shown when no existing recipe is selected yet.
export const BUILDER_DEFAULT_SAVE_TARGET = 42

// Builder slot labels use the longest localized string to reserve space so all
// slot icons line up consistently regardless of translation length. A small
// buffer keeps the text from hugging the measurement edge.
export const BUILDER_SLOT_LABEL_WIDTH_BUFFER_PX = 4

// Shared height for builder toggle groups and aligned controls.
export const BUILDER_TOGGLE_BUTTON_HEIGHT_PX = 36
// Minimum width for individual stat toggle buttons so labels stay legible.
export const BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX = 88
// Shared clear icon buttons (builder labels, inline clears, etc.). Fixed size prevents layout shift.
export const CLEAR_ICON_BUTTON_SIZE_PX = 28
// Overlay close buttons for context menus. Sized smaller than standard icon buttons so they sit
// unobtrusively in the menu corner while remaining tappable across pointer types.
export const CONTEXT_MENU_CLOSE_BUTTON_SIZE_PX = 24
export const CONTEXT_MENU_CLOSE_BUTTON_OFFSET_PX = 4
// Max height for the history context menu body. Larger histories scroll within
// this window so the paper and close button stay visible.
export const HISTORY_MENU_MAX_HEIGHT_PX = 360
// Max width for builder history tooltips so multi-line diffs stay readable
// without covering the entire viewport.
export const HISTORY_TOOLTIP_MAX_WIDTH_PX = 728
// Cap the number of per-item diffs shown in the Gear DB endpoint toast.
export const GEAR_DB_DIFF_TOAST_MAX_ITEMS = 18
// Single-sided (add-only/remove-only) toasts render in two columns, so allow
// the toast payload to retain both columns before truncation.
export const GEAR_DB_DIFF_TOAST_SINGLE_SIDED_MAX_ITEMS = GEAR_DB_DIFF_TOAST_MAX_ITEMS * 2
// History can render single-sided add/remove updates in two columns, so retain
// enough entries to fill both columns before truncating.
export const GEAR_DB_DIFF_HISTORY_MAX_ITEMS = GEAR_DB_DIFF_TOAST_MAX_ITEMS * 2
// Keep 8 hours of endpoint updates at a 10-second push cadence.
// The menu trims older updates first so retained memory stays bounded.
export const GEAR_DB_DIFF_HISTORY_MAX_UPDATES = 2880
// Cap Gear DB history tooltip height so tall diff lists scroll inside the popper.
export const GEAR_DB_HISTORY_TOOLTIP_MAX_HEIGHT_PX = 640
// Scale factor for Gear Inspector cards rendered inside the Gear DB diff toast/history.
export const GEAR_DB_DIFF_TOAST_CARD_SCALE = 0.7
// Idle gutter for substat toggles; shrinks the placeholder columns when no roll
// badge is visible so long labels (e.g., CDMG%) avoid clipping without widening
// the entire button. Selected/hover states restore the full badge gutter.
export const BUILDER_SUBSTAT_IDLE_GUTTER_PX = ROLL_BADGE_SIZE_PX - 4

// Substat roll target editor (Base + up to 5 rolls). Shared between the builder UI and
// rule generation so manual overrides clamp consistently regardless of entry point.
export const SUBSTAT_TARGET_MAX_ROLLS = GENERATED_SUBSTAT_MAX_ROLLS_PER_SLOT

// Idle nudge for dirty builder state before prompting attention on the
// "Save changes to selected" control. Expressed as seconds × 1000 to
// preserve intent and make adjustments safer.
export const BUILDER_DIRTY_NUDGE_IDLE_MS = 300 * 1000
// While in the attention phase, how often to replay a suite effect burst
export const BUILDER_DIRTY_ATTENTION_INTERVAL_MS = 5 * 1000

// Final-sell level milestones and defaults
// Why: These values are used in multiple places (UI, merge/export, SFR defaults)
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
// Inline controls for the gear-sets Select. Reserve enough space inside the
// input so the dropdown icon and the inline clear button never overlap.
const SETS_SELECT_ICON_TEXT_GAP_PX = 4
const SETS_SELECT_CLEAR_BUTTON_GAP_PX = 4
export const SETS_SELECT_DROPDOWN_ICON_HITBOX_PX = 32
export const SETS_SELECT_CLEAR_BUTTON_RIGHT_PX = SETS_SELECT_DROPDOWN_ICON_HITBOX_PX + SETS_SELECT_CLEAR_BUTTON_GAP_PX
export const SETS_SELECT_CLEAR_BUTTON_SIZE_PX = SMALL_BUTTON_HEIGHT_PX
export const SETS_SELECT_INLINE_GUTTER_PX = SETS_SELECT_CLEAR_BUTTON_SIZE_PX + SETS_SELECT_CLEAR_BUTTON_RIGHT_PX
// Collapsed gutter used whenever the inline clear affordance is hidden. Matches the
// dropdown icon hitbox so the empty space still opens the Select menu.
export const SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX = SETS_SELECT_DROPDOWN_ICON_HITBOX_PX + SETS_SELECT_ICON_TEXT_GAP_PX


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
// Manage Metasets dialog should always show a full page of rows so the dialog
// stays stable while adding/removing entries. Each row is the small text field
// plus spacing for chips/buttons, which is roughly the small button height
// with an extra 20px cushion for gutters.
export const METASETS_ROW_HEIGHT_PX = SMALL_BUTTON_HEIGHT_PX + 20
export const METASETS_DIALOG_VISIBLE_ROWS = 10
export const METASETS_DIALOG_LIST_HEIGHT_PX = METASETS_ROW_HEIGHT_PX * METASETS_DIALOG_VISIBLE_ROWS
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
export const SETS_TOOLTIP_MAX_WIDTH_PX = SETS_MENU_WIDTH_PX

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
// Same concept for the safeguard builder: stores the user's preferred starting
// state. When absent the builder resets to factory defaults.
export const SAFEGUARD_BUILDER_USER_DEFAULTS_KEY = 'sellfileCreator.safeguardBuilder.userDefaults.v1'

// Builder: when enabled, resets the builder controls to defaults immediately
// after inserting a recipe (no confirmation). Default Off. Persisted here so
// the behavior is stable across sessions.
export const BUILDER_AUTO_RESET_AFTER_INSERT_KEY = 'sellfileCreator.builder.autoResetAfterInsert.v1'
// Builder: when enabled, automatically applies changes to the currently
// selected recipe after a short debounce. Default Off; stored separately so
// users can keep the behavior between sessions.
export const BUILDER_AUTO_APPLY_SELECTED_RECIPE_KEY = 'sellfileCreator.builder.autoApplySelectedRecipe.v1'
// Builder: controls whether tag chips render next to the Tags button.
// Default Off so the chip row stays hidden until explicitly enabled.
export const BUILDER_SHOW_TAG_CHIPS_KEY = 'sellfileCreator.builder.showTagsChips.v1'
// Builder: persisted collapsed state for the 7 per-group collapsible sections
// in the recipe builder panel.
export const BUILDER_RECIPE_COLLAPSED_KEY = 'sellfileCreator.builder.recipeCollapsed.v1'
// Builder: persisted collapsed state for the 7 per-group collapsible sections
// in the safeguard builder panel.
export const BUILDER_SAFEGUARD_COLLAPSED_KEY = 'sellfileCreator.builder.safeguardCollapsed.v1'
// Sellfile export: when enabled, dedupe merged rules before exporting/pushing
// the .hsf. Stored so users can persist their preference.
export const SELLFILE_DEDUP_DEFAULT_KEY = 'sellfileCreator.sellfile.dedupDefault.v1'
// Sellfile export: when enabled, omit rules with Use === false from export/push
// outputs. Stored separately so skipping disabled rules persists across sessions.
export const SELLFILE_OMIT_DISABLED_KEY = 'sellfileCreator.sellfile.omitDisabled.v1'
// Sellfile export: when enabled and an endpoint is active, automatically push the sellfile
// whenever unsaved changes are detected (hsfDirty rising edge).
export const SELLFILE_AUTO_PUSH_KEY = 'sellfileCreator.sellfile.autoPush.v1'
// Sellfile export: pushes now route through `/hsf/` so receivers can distinguish
// payload classes (future uploads can use their own prefixes without guessing).
export const SELLFILE_PUSH_PATH_SEGMENT = 'hsf'
// Debounce window (ms) before auto-apply saves changes to the selected recipe.
// Matches the builder's pacing so rapid edits don't spam apply calls while
// still feeling responsive.
export const BUILDER_AUTO_APPLY_DEBOUNCE_MS = 400

// Rarity UI label for automatic resolution (SFR writes this label; HSF export
// always uses a concrete rarity code). Keeping it centralized avoids string
// drift across IO and UI.
export const RARITY_AUTO_LABEL = 'Auto'

// Preview table display preferences
// Why: Keep user choices consistent across sessions without affecting other
// app storage. Versioned to allow changing defaults without migrations.
export const RULES_TABLE_SHOW_SLOT_ICONS_KEY = 'sellfileCreator.rulesTable.slotIcons.v2'
export const RULES_TABLE_SHOW_SET_ICONS_KEY = 'sellfileCreator.rulesTable.setIcons.v2'
export const RULES_TABLE_SHOW_FACTION_ICONS_KEY = 'sellfileCreator.rulesTable.factionIcons.v1'
export const GEAR_INSPECTOR_PREVIEW_LAYOUT_KEY = 'sellfileCreator.gearInspector.previewLayout.v1'
export const GEAR_INSPECTOR_GRID_COLUMNS_KEY = 'sellfileCreator.gearInspector.grid.columns.v1'
export const GEAR_INSPECTOR_GRID_SHOW_FIRST_MATCH_KEY = 'sellfileCreator.gearInspector.grid.showFirstMatch.v1'
export const GEAR_INSPECTOR_GRID_SHOW_MATCH_RECIPE_INDEX_KEY = 'sellfileCreator.gearInspector.grid.showMatchRecipeIndex.v1'
export const GEAR_INSPECTOR_GRID_SHOW_MATCH_LINE_KEY = 'sellfileCreator.gearInspector.grid.showMatchLine.v1'
export const GEAR_INSPECTOR_GRID_SHOW_OTHER_MATCHES_KEY = 'sellfileCreator.gearInspector.grid.showOtherMatches.v1'
// Safeguards keeps its own default for "show other matches" so Gear Inspector stays unchanged.
export const SAFEGUARDS_GRID_SHOW_OTHER_MATCHES_KEY = 'sellfileCreator.safeguards.grid.showOtherMatches.v1'
export const GEAR_INSPECTOR_GRID_SHOW_CHAMP_ICONS_KEY = 'sellfileCreator.gearInspector.grid.showChampIcons.v1'
export const GEAR_INSPECTOR_GRID_SHOW_RULE_TEMPLATES_KEY = 'sellfileCreator.gearInspector.grid.showRuleTemplates.v1'
// Gear Inspector grid: keep/sell outcome background emphasis toggle.
// Why: this is view-only card styling and should persist across sessions like other grid toggles.
export const GEAR_INSPECTOR_GRID_HIGHLIGHT_KEEP_SELL_KEY = 'sellfileCreator.gearInspector.grid.highlightKeepSell.v1'
// Gear Inspector grid: safeguard improvement chance overlay toggle.
// Why: the overlay is view-only and should persist across sessions like other grid display toggles.
export const GEAR_INSPECTOR_GRID_SHOW_SAFEGUARD_IMPROVEMENT_CHANCE_KEY = 'sellfileCreator.gearInspector.grid.showSafeguardImprovementChance.v1'
// Gear Inspector grid: safeguard rank chip overlay toggle.
// Why: rank is a secondary overlay; users may want improvement chance without rank for a cleaner view.
export const GEAR_INSPECTOR_GRID_SHOW_SAFEGUARD_RANK_KEY = 'sellfileCreator.gearInspector.grid.showSafeguardRank.v1'
// Gear Inspector grid: substat sorting controls.
// Why: Sorting is view-only (like filters) but should persist across sessions.
export const GEAR_INSPECTOR_SUBSTAT_SORT_KEY = 'sellfileCreator.gearInspector.sort.substats.v1'
// Gear Inspector grid: normalized overlay presets + selection.
// Why: Overlay is view-only, but users need the presets to persist across sessions.
export const GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_KEY = 'sellfileCreator.gearInspector.grid.normalizedOverlay.v1'
// Preview selection scroll sources.
// Why: Auto-scroll should only fire from explicit user/command signals.
export const SELECTION_SCROLL_SOURCE_USER = 'user' as const
export const SELECTION_SCROLL_SOURCE_SELECT_RULE = 'selectRule' as const
// Union type keeps selection scroll sources in sync across UI layers.
export type SelectionScrollSource =
  | typeof SELECTION_SCROLL_SOURCE_USER
  | typeof SELECTION_SCROLL_SOURCE_SELECT_RULE
// Selection scroll requests carry a monotonic token to gate side effects.
// Why: effects can ignore re-renders that aren't explicit scroll requests.
export type SelectionScrollRequest = {
  // Monotonic counter used to detect explicit scroll intents.
  token: number
  // Source of the request (user or command).
  source: SelectionScrollSource
  // Target recipe index to scroll to (mutually exclusive with targetSafeguardOrdinal).
  targetRecipeIdx: number | null
  // Target safeguard ordinal to scroll to — set when a safeguard chip triggers the scroll.
  targetSafeguardOrdinal?: number | null
}

// Fixed width for Faction Select in the Rules filter
// Why: Keep the input width stable regardless of selected label lengths,
// matching the visual footprint of the Builder's Faction selector.
export const FILTER_FACTION_SELECT_WIDTH_PX = 260
// Fixed width for Sets Select in the Rules filter (top-row next to Rule)
// Why: Keep Rule wide and Sets compact to avoid a 50/50 split while preserving readability.
export const FILTER_SETS_SELECT_WIDTH_PX = 320

// Fixed width for compact toggle buttons in the Rules filter (Keep/Sell, Enabled/Disabled).
// Why: Match the English layout footprint while allowing longer translations to ellipsize.
export const FILTER_TOGGLE_BUTTON_WIDTH_PX = 86

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
export const RULES_TABLE_OVERSCAN_FAST = 4
export const RULES_TABLE_OVERSCAN_IDLE = 20

// Rules table row height (single-line mode)
// Why: In single-line mode, we intentionally keep every preview row a strict fixed height so TanStack virtualization
// can compute exact offsets without DOM measurement, even for very large index jumps.
export const RULES_TABLE_FIXED_ROW_HEIGHT_PX = 34

// Throttle for propagating hover from the preview table to the chips panel
// Why: Rapid hover updates across thousands of rows can cause frequent
// top-level re-renders (App) when linking chip highlights. We keep the
// table’s own row highlight immediate and propagate to App at most once per
// frame to keep interactions snappy without jank.
export const RULES_TABLE_HOVER_PROPAGATION_MS = 32

// Delay before hiding the scroll range hint overlay in the preview table.
// Why: Keep the overlay visible briefly after scroll stops so users can read
// the range without the badge flickering on short, repeated scrolls.
export const RULES_TABLE_SCROLL_HINT_HIDE_MS = 360

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

// Gear dialog layout sizing
// Fixed width for a single substat editor (variant + steppers + value field).
// Slightly narrower to reduce unused space after the + button while keeping
// a stable two‑column grid across locales and label lengths.
export const GEAR_INSPECTOR_SUBSTAT_EDITOR_WIDTH_PX = Math.round(320 * 0.84)
// Reserved width for the per-row control column (add/remove buttons) in the
// Gear dialog so substats/results align with the first selector (slot).
export const GEAR_INSPECTOR_ROW_CONTROLS_WIDTH_PX = 56
// Fixed min-widths for selects inside the Gear dialog (slightly narrower for better fit)
// Keep these centralized to avoid magic numbers and ensure consistent sizing.
// Reduced by ~15% for tighter layout
// Reduced by another 3% for a tighter layout while keeping readability.
// Keep as a calculation to preserve intent for future tuning.
// Reduce a bit further to improve fit in the gear row
export const GEAR_INSPECTOR_MAINSTAT_SELECT_MIN_WIDTH_PX = 125
export const GEAR_INSPECTOR_SUBSTAT_SELECT_MIN_WIDTH_PX = 125
// Fixed widths so Select content changes don't shift layout
// Shared width keeps the slot and set selectors perfectly aligned across rows.
const GEAR_INSPECTOR_SLOT_SET_COLUMN_WIDTH_PX = Math.round(200 * 1.10)
export const GEAR_INSPECTOR_SLOT_SELECT_WIDTH_PX = GEAR_INSPECTOR_SLOT_SET_COLUMN_WIDTH_PX
export const GEAR_INSPECTOR_SET_SELECT_WIDTH_PX = GEAR_INSPECTOR_SLOT_SET_COLUMN_WIDTH_PX
export const GEAR_INSPECTOR_FACTION_SELECT_WIDTH_PX = 180
export const GEAR_INSPECTOR_RANK_SELECT_WIDTH_PX = 90
// Rarity column mirrors faction width so the two rows stay aligned.
export const GEAR_INSPECTOR_RARITY_SELECT_WIDTH_PX = GEAR_INSPECTOR_FACTION_SELECT_WIDTH_PX
export const GEAR_INSPECTOR_LEVEL_SELECT_WIDTH_PX = 90
// Uniform Select height for Gear dialog controls
export const GEAR_INSPECTOR_SELECT_HEIGHT_PX = 40

// Sentinel for accessories that do not belong to any set (e.g., base banners/rings/amulets).
// Shared by the Gear Inspector and Final Sell remainder rules so no-set accessories are matched.
// Value is generated from shared/domain-constants.json to keep TS and Rust aligned.
export const ACCESSORY_NO_SET_ID = GENERATED_ACCESSORY_NO_SET_ID

// Special ID used only by the Gear Inspector for "Any slot" (no slot restriction).
// Semantics: Matches only HSF rules whose ArtifactType is Any (empty list);
// rules that restrict to specific slots do not match this sentinel.
export const GEAR_INSPECTOR_ANY_SLOT_ID = 0

// Minimum height for the Gear Inspector result row so layout does not shift
// when switching between a detailed match (chip + text + button) and the
// compact "No match" text. Chosen to comfortably fit a small Chip and a
// small Button in a single line.
export const GEAR_INSPECTOR_RESULT_ROW_MIN_HEIGHT_PX = 36

// Maximum width for the Gear Inspector config chip before truncating with ellipsis.
// Chosen to balance long names without forcing the row to wrap unexpectedly.
export const GEAR_INSPECTOR_RECIPE_CHIP_MAX_WIDTH_PX = 520

// Fixed dimensions for the Gear dialog so its layout remains predictable.
// Width is trimmed below the previous 1120px cap for a tighter footprint; height
// keeps the content scrollable without overwhelming shorter displays.
export const GEAR_INSPECTOR_DIALOG_WIDTH_PX = 920
export const GEAR_INSPECTOR_DIALOG_HEIGHT_PX = 780
// Virtualization heuristics keep the Gear Inspector responsive even with many expanded rows.
export const GEAR_INSPECTOR_VIRTUAL_OVERSCAN_PX = 320
export const GEAR_INSPECTOR_ROW_ESTIMATE_COMPACT_PX = 180
export const GEAR_INSPECTOR_ROW_ESTIMATE_EXPANDED_PX = 420
// Shared inline icon size for Gear Inspector compact chips (preview + safeguards).
// Keeps slot/set/faction icons from hitting the chip border while staying recognizable.
export const GEAR_INSPECTOR_COMPACT_ICON_SIZE_PX = 16
// Extra padding applied to compact chips that render icons; tuned high right now
// while validating spacing. Reduce once the desired inset is confirmed visually.
export const GEAR_INSPECTOR_COMPACT_ICON_LEFT_PADDING_PX = 5

// Champion avatars share sizing across the Gear Inspector grid and filters so rarity borders stay consistent.
export const CHAMPION_ICON_BASE_SIZE = Object.freeze({ width: 26, height: 26 })
export const CHAMPION_ICON_LARGE_SIZE = Object.freeze({ width: 38, height: 38 })
export const CHAMPION_ICON_LARGE_THRESHOLD = 5
export const CHAMPION_ICON_BORDER_RADIUS_PX = 8
