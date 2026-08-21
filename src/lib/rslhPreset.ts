/**
 * rslhPreset.ts
 *
 * RSLH ("RSL Helper" skin) is NOT a separate MUI color scheme. It is the DARK theme with a
 * fixed set of ThemeCustomization values pre-applied — the exact same value slots a user can
 * edit in the theme popout. This guarantees, by construction, that anything RSLH does is
 * reproducible by hand on the dark theme: RSLH and "dark + manual edits" run identical code.
 *
 * The skin these values reproduce was originally brute-forced as an injected !important
 * stylesheet on built HTML (the user couldn't reach the runtime theme controls). Routing it
 * through ThemeCustomization instead means surfaces are FLAT (paperColor/bgColor bypass MUI's
 * elevation/derivation), matching the skin instead of MUI's per-scheme tinting.
 *
 * NOTE on warning: the source skin used orange (#F1960E) for warning, but RSLH's primary
 * accent is also orange (#FF8800) — indistinguishable. Warning is adapted to amber (#FFC107)
 * so "caution" reads as a distinct hue from the orange accent.
 */
import type { ThemeCustomization } from './constants'
import { EMPTY_THEME_CUSTOMIZATION } from './constants'

// Font stacks matching the skin: Segoe UI for UI chrome, Cascadia Code for code/markdown.
// Kept as named constants so the popout could surface them as suggested values later.
export const RSLH_UI_FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
export const RSLH_CODE_FONT = '"Cascadia Code", "Consolas", ui-monospace, monospace'

// The RSLH value-set. Fields the skin defined carry concrete values; the few it left alone stay
// null to inherit the dark-base default. User edits layer on top via mergeCustomization (user
// wins per field).
export const RSLH_PRESET: ThemeCustomization = {
  primaryColor: '#FF8800',        // orange accent
  toggleColor: null,              // inherit dark toggle behavior (white-tinted) — skin didn't override
  selectionColor: '#cc9064',      // warm tan selection tint (was inheriting dark's blue #4e94e5)
  bgColor: '#151515',             // flat window background
  paperColor: '#2C2C2C',          // flat surface (skin's lighter card paper)
  // Gold-skin era: RSLH hairlines join the app-wide gold molding, but in a warmer, slightly
  // muted gold so the frames sit with the orange #FF8800 accent instead of competing with it.
  borderStyleMode: null,          // inherit the app default (gold molding); user choice wins
  dividerColor: '#5a4a26',
  frameGoldColor: '#b8933f',
  titleGoldColor: '#e9d8a6',
  successColor: '#81C784',
  warningColor: '#FFC107',        // adapted from skin's #F1960E (collision with orange primary)
  errorColor: '#ff7474',
  infoColor: '#64B5F6',
  textPrimaryColor: '#F7F8FA',
  textSecondaryColor: '#D6D6D6',
  textDisabledColor: '#666666',
  uiFontFamily: RSLH_UI_FONT,
  codeFontFamily: RSLH_CODE_FONT,
  // Gold-skin era: the thumb follows the molding. The preset's divider gold (#5a4a26) on the
  // #2C2C2C paper track is only ΔL≈14 — it reads as "no scrollbar" — so the preset pins a
  // brighter gold (#7a6535, ΔL≈26) to match dark's thumb/track contrast while staying golden.
  scrollbarThumbColor: '#7a6535',
  borderRadius: 8,                // skin: cards 8px (controls were 6px; single knob → 8)
  selectionOpacity: null,         // inherit dark default
}

// Merge user customization OVER a base preset: any field the user has explicitly set (non-null)
// wins; otherwise the base (RSLH) value is used. This is the "layer edits on RSLH" model — the
// user can recolor the accent while keeping the rest of the RSLH look, and switching back to
// plain Dark drops the base while keeping their explicit edits.
export function mergeCustomization(base: ThemeCustomization, user: ThemeCustomization): ThemeCustomization {
  // Start from a complete object so no key is ever missing, then apply base then user-wins.
  const out: ThemeCustomization = { ...EMPTY_THEME_CUSTOMIZATION }
  for (const key of Object.keys(out) as (keyof ThemeCustomization)[]) {
    // user value wins when set (non-null); else fall back to the base preset value.
    const userVal = user[key]
    // TS can't narrow the union across the keyed assignment, so cast through the field type.
    ;(out as Record<keyof ThemeCustomization, string | number | null>)[key] =
      userVal != null ? userVal : base[key]
  }
  // Border style is the one field where a preset value is not merely a default the user may
  // replace — it decides whether a whole visual language applies. When the user has chosen
  // 'neutral', the preset's own hairline gold would still win (the user set no dividerColor),
  // leaving gold frames in a mode that promises none. Drop it so neutral means neutral.
  if (out.borderStyleMode === 'neutral' && user.dividerColor == null) out.dividerColor = null
  return out
}
