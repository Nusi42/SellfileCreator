/**
 * Centralized app-wide constants.
 *
 * Why: These values are used in multiple places and must remain consistent.
 * Centralizing avoids drift and clarifies intent without changing behavior.
 */

// Autosave storage key for HSFR sessions
export const AUTOSAVE_KEY = 'autosave.hsfr.v1'

// Persisted toggle for coloring stat button borders in the builder
export const STAT_BUTTON_BORDERS_KEY = 'statButtonBorders.v1'

// Persisted substat color map (v5 schema)
export const COLORS_STORAGE_KEY_V5 = 'substatColors.v5'

// UI sizing constants for roll badges in the builder
export const ROLL_BADGE_SIZE_PX = 16
export const ROLL_BADGE_HOVER_GUTTER_PX = 6

// Layout widths (see docs/TECHNICAL.md)
export const PANEL_WIDTH_PX = 1152
export const SIDE_BY_SIDE_BREAKPOINT_PX = 2320
export const GRID_COLUMN_GAP_PX = 16

// Shared UI transitions
export const UI_BG_TRANSITION = 'background-color 220ms ease-in-out 60ms'

// File picker accept strings
export const ACCEPT_HSF = '.hsf,application/json'
export const ACCEPT_HSFR = '.hsfr,application/json'
