# UI Redesign Proposal — Adopting the the host application "Gold Molding" Skin

Status: **implemented** (decisions A1 / B / C / D1, 2026-08-21) — kept for design rationale.
The authoritative technical reference is now the "Gold Skin" section of
[`../technical/theming-system.md`](../technical/theming-system.md). Implementation notes vs
this proposal: builder-form/filter-panel inline labels kept their neutral colour (they are
field labels sharing a row with dirty-state highlights, not section titles); the gold title
voice landed on dialog titles, context-menu titles, and chart headers. Chip/badge micro
shadows (`theme.shadows[1..4]`) were left as-is; the floating-layer shadow consolidation
covers menus/popovers/dialogs/tooltips/floating panels. Source design: `the host application's checkout`
("Stuck skin", defined in its `src/theme.ts` and `src/components.tsx`).

---

## 1. What we are adopting (and why it transfers cleanly)

The the host application look is carried almost entirely by five theme-level ideas:

1. **The molding.** Every `Paper` wears a double frame: a 1px hairline in a *dimmed gold*
   `divider` + a faint lit inner line (`inset 0 0 0 1px alpha(gold, ~0.18)`). No elevation
   shadows on surfaces — the gold frame *is* the depth cue.
2. **Two gold CSS vars per scheme.** `--gold-lit` (frame gold) and `--gold-title` (bright
   title gold), published per color scheme; everything (ornaments, titles, scrollbars,
   steppers) consumes the vars and never branches on scheme.
3. **The corner ornament.** A small absolutely-positioned SVG "L" bracket with a ◆ diamond at
   the elbow, top-left + top-right corners of *cards only* (not menus/popovers). Stroke in
   frame gold, diamond in title gold. Out of flow, `pointer-events: none`, cannot shift layout.
4. **Gold small-caps section titles** with a `◆ ` prefix (`overline` voice, letter-spaced,
   title gold).
5. **Tooltips as small panels.** Paper background (not the stock grey pill), gold hairline +
   inset lit line, bordered arrow, small radius, and the app's only true drop shadow.

The **grey dialog background** a review flagged in the host application is MUI's dark-mode *elevation
overlay*: `Dialog` hardcodes `elevation: 24`, and in cssVariables mode Paper paints
`backgroundImage: var(--Paper-overlay)` ≈ `rgba(255,255,255,0.165)` over the paper color —
washing navy into grey. Menus/popovers get the same at elevation 8. **Fix at adoption:**
`backgroundImage: 'none'` inside our global `MuiPaper` override (we may keep a soft drop
shadow for floating layers — see §4.5). Sellfile Creator uses cssVariables mode too, so our
own dark dialogs have this overlay today; the fix applies here identically.

Why it transfers cleanly:

- Both apps are MUI v9 + Emotion + cssVariables (`data-mui-color-scheme`), styled via
  `theme.components` overrides + `sx` only. No `styled()` anywhere in SFC.
- SFC **already** has the global `MuiPaper` 1px `divider` border (`src/theme.ts:151`) — the
  molding is a retint of `divider` + one added inset line + one removed overlay.
- SFC funnels every dialog / menu / context menu / tooltip through single choke points
  (`MuiDialog`/`MuiMenu`/`MuiPopover` theme overrides, `ContextMenuPaper`, `MarkdownTooltip`),
  so the new chrome rolls out app-wide from a handful of files.
- The gold vars slot straight into the existing `themeCustomTokens.ts` machinery
  (`APP_CSS_VAR` + `APP_SCHEME_ALPHAS` with TS key-parity enforcement).

**Not adopted** (orthogonal to the visual skin, out of scope): the host application's `check:ui` token
ratchet script, its `CONTROLS` geometry token table, and its text-role typography rewrite
(`heading`/`note`/`hint`/… variants). Worth considering later as separate efforts; the skin
does not depend on them.

---

## 2. The three schemes

Gold values are defined **once** as customization-aware tokens with per-scheme defaults.
Proposed defaults (the host application's exact values for dark/light; RSLH gets a warmer gold tuned to
its orange):

| Token | Dark | Light | RSLH (preset) |
|---|---|---|---|
| frame gold (`--app-gold-lit`) | `#c9a24b` | `#8a6a2a` | `#b8933f` (warm, sits with `#FF8800`) |
| title gold (`--app-gold-title`) | `#e9d8a6` | `#6d5620` | `#e9d8a6` |
| `divider` (dimmed gold) | `#5f5029` | `#a08036` | `#5a4a26` |
| inset lit-line alpha | `0.18` | `0.14` | `0.18` |
| scrollbar thumb | `alpha(gold-lit, 0.35)` | `alpha(gold-lit, 0.4)` | `alpha(gold-lit, 0.35)` |

### Decision A — base palette depth (RECOMMENDED: full adoption for Dark/Light)

Two options for the Dark/Light base colors:

- **A1 (recommended): adopt the host application's palettes wholesale.**
  Dark: bg `#0b1017`, paper `#101a26` (desaturated navy), text `#ccd6e0`/`#a6b3c2`/`#5d6b7a`,
  primary `#46c8f0` (cyan). Light: bg `#ddd5c2`, paper `#efe9d9` (parchment), text
  `#2a2416`/`#5a5342`, primary `#0e7fa8`. This is the requested look — the gold reads
  as gold because the navy/parchment underneath is desaturated and warm-neutral. Also adopt
  the "three greys only" text rule and "colour is spent on state, never class".
- **A2: keep SFC's current GitHub-ish bases** (`#0f1216`/`#161b22`, `#cecece`/`#fafafa`,
  primary `#58a6ff`/`#0969da`) and add only the gold frame language. Cheaper visually
  conservative option; the gold molding on neutral grey-dark works but loses much of the
  skin's character (gold-on-navy is the identity). Light `#cecece` is notably colder than
  parchment.

RSLH keeps its flat charcoal (`#151515`/`#2C2C2C`) and orange primary `#FF8800` — that preset
mimics RSL Helper and must stay recognizable — but its `dividerColor` moves from `#3C3C3C`
grey to dimmed gold, and it gains the gold vars above. Orange primary + gold frames is a
coherent warm pairing.

All user-customization knobs keep working: `bgColor`/`paperColor`/`dividerColor`/… continue to
override per-field. See Decision C for exposing the golds themselves as knobs.

### Contrast adaptation fallout (automatic, but must be verified)

`useSubstatFgAdapter` / `resolveRarityTextColor` / note-color vars all adapt against the
runtime scheme paper, so changing paper colors re-derives all adapted user/preset colors for
free. The **light parchment** (`#efe9d9`, warm) will shift adapted hues slightly — spot-check
rarity 5 gold `#f9a825` and warm substat colors against parchment. `WCAG_MIN_CONTRAST` /
`RARITY_TEXT_MIN_CONTRAST` stay as-is.

---

## 3. New tokens (SSOT plumbing)

- `SKIN`-style source of truth in `src/theme.ts` (build-time hexes) exposed as CSS vars via
  the existing `APP_CSS_VAR` / `APP_SCHEME_ALPHAS` machinery in `src/lib/themeCustomTokens.ts`:
  - `--app-gold-lit`, `--app-gold-title` (per scheme; RSLH overrides via customization).
  - `--app-gold-inset-alpha` (per-scheme alpha for the lit inner line) → prebuilt
    `theme.custom.goldInsetLine` string usable in `boxShadow`.
- `ThemeCustomization` gains `frameGoldColor` / `titleGoldColor` (nullable = scheme default);
  `RSLH_PRESET` sets the RSLH values from the table above. Serialization is additive (new
  optional fields — backward compatible with saved customization blobs).
- `divider` defaults change per scheme in `buildSchemePalette`; `dividerColor` customization
  continues to win.
- Scrollbar default thumb becomes `alpha(frameGold, …)`; the existing user knob
  `scrollbarThumbColor` continues to override.
- The existing `TINT.neutralBorder*` / `theme.custom.neutralBorder|weakBorder|ghostBorder`
  family stays on the text-secondary channel — see Decision D.

### Decision C — expose golds in the Theme Editor (RECOMMENDED: yes)

Add "Frame gold" and "Title gold" pickers to `ThemeEditorMenu` next to the divider picker.
Cost is small (the menu already has ~14 pickers) and it keeps the "everything is tunable"
promise of the editor. If declined, the tokens still exist — just without UI.

### Decision D — how far does gold reach into *component* borders?

the host application's rule: "a resting hairline is always the molding" — inputs, toggles, badges, chips
all frame in `divider` gold; color appears only for state (focus = primary, error = red,
selected = tinted). SFC options:

- **D1 (recommended): full rule.** Outlined inputs/selects get a `notchedOutline` override to
  `divider` (MUI hardcodes grey there — same fix the host application made); chip/badge neutral borders
  move from the text-secondary channel to `divider`. `TINT.neutralBorder*` entries retarget to
  the divider channel (allowed channel list already includes `divider`), so the change is a
  token edit, not a component sweep. Semantic borders (`successBorder`, `errorRemovedBorder`,
  `warningBorder`, selection tints) are state and stay colored.
- **D2: gold only on surfaces** (Paper/dialog/menu/tooltip frames), controls keep neutral grey
  hairlines. Safer but produces the exact mixed-frame inconsistency the host application documents as the
  reason for their rule.

---

## 4. Surface-by-surface rollout

Grounded in the full UI inventory (≈149 component files; ~30 dialogs, 35 menus, 13
popovers/poppers, 1 floating panel, 2 game flyouts, 9 hand-rolled charts).

### 4.1 Global chrome (one-file changes, app-wide effect)

| Change | Where | Covers |
|---|---|---|
| Molding on Paper: `divider` hairline (already there) + `theme.custom.goldInsetLine` inset + `backgroundImage: 'none'` | `MuiPaper.root` in `src/theme.ts` | every dialog, menu, popover, autocomplete, card, panel, both builder columns, floating note panel, easter-egg flyouts |
| Kill elevation-grey on dialogs | same override (`backgroundImage: 'none'`) | all ~30 dialogs |
| Tooltip plate: paper bg, gold hairline, inset line, bordered arrow, `0 4px 14px` drop, small radius | `MuiTooltip` override in `src/theme.ts` | every tooltip (all flow through `MarkdownTooltip`) |
| Gold scrollbars | `src/lib/scrollbar.ts` + App.tsx global block — retarget to the gold thumb vars | all scroll panes incl. `ClippedScrollBody` |
| Focus/selection unchanged | — | primary-colored focus rings, `action.selected` tints keep their per-scheme colors |

### 4.2 New primitives

- **`GoldCornerOrnament`** (`src/components/GoldCornerOrnament.tsx`) — port of the host application's
  `CardOrnament` §3.2: absolutely-positioned SVG, top-left + top-right, `inset 5 / arm 13 /
  gem 3.5 / stroke 1.25` tokens, stroke `var(--app-gold-lit)`, diamond `var(--app-gold-title)`,
  `aria-hidden`, `pointer-events: none`. Fixed arm length (deliberate the host application decision — the
  mark reads identically on every panel).
- **`GoldSectionTitle`** (or a shared `sx` factory) — gold small-caps with `content: "◆ "`
  prefix (frame gold at `0.7em`), title in title gold, letter-spaced.

### 4.3 Ornament placement (Decision B — RECOMMENDED scope below)

the host application's rule: ornaments belong to *cards*, never to menus/hover plates/dropdowns.
Recommended SFC mapping — **major stationary panels + true modal dialogs only**:

- ✅ Builder column Paper (`AppLayout/BuilderColumn.tsx`) and Preview panel Paper (`App.tsx`).
- ✅ Modal dialogs: on the `Dialog` paper (all ~30, incl. all confirms — via a shared dialog
  slotProps helper or a light wrapper so it stays one definition). Small confirms still look
  right because the ornament is fixed-size and inside the frame.
- ✅ Note floating panel + centered/simple Note dialog (`NoteDialog.tsx`).
- ✅ Easter-egg flyout shell (`EasterEggFlyoutShell.tsx`) — it's a framed "window".
- ❌ Menus, context menus (`ContextMenuPaper`), popovers, the sort popout, hover cards,
  tooltips, toasts, chips, KPI tiles, grid cards (far too dense — hundreds of cards).

### 4.4 Titles & headers

- `MuiDialogTitle` override → gold title voice (keep current 18px/600 size; color
  `--app-gold-title`, optional ◆ prefix — propose **with** ◆ for dialogs).
- `ContextMenuTitle` (all context menus) → same voice at menu scale.
- Builder section headers (`BuilderSectionToggle`), Logic Hub tab panel headings, Gear
  Analytics chart headers (`GearAnalyticsChartHeader`), filter-panel group labels →
  `GoldSectionTitle` voice. Chevrons in disclosure headers tint to frame gold (the host application's
  `DisclosureTitle`).
- App header: title stays `text.primary` (SFC's "SFC" weight-800 gag is identity); the
  version/meta caption may take title-gold — decide by eye during implementation.

### 4.5 Shadows & layering

the host application is shadow-free except tooltips; SFC stacks deeper (dialog → menu → tooltip), so:
keep **one** soft drop shadow for *floating* layers (menus, popovers, tooltips, context
menus, toasts, floating note panel) — a single token replacing today's ad-hoc
`theme.shadows[3..10]` ladder — and **no shadow** on stationary panels/cards (molding only).
Glow/pulse effects (`attentionPulse`, `TINT.primaryGlow` rings) are state, unchanged.

### 4.6 Tooltip content (the one real migration)

Restyling the plate to paper background **retires the documented "inverted dark tooltip
surface" SSOT exception**:

- `BuilderTooltipContent.tsx` (1,646 ln): `TINT.onDarkSecondaryText` (white @ 0.70) →
  `text.secondary`; any raw stat/rarity colors inside tooltip bodies must run through the
  normal adapters against paper (they currently rely on the dark plate).
- `renderColoredStatText` tooltip call sites and gear-inspector grid tooltips: same.
- `SetTooltip` colored buffs: adapt against paper.
- Update `docs/technical/theming-system.md` exceptions list accordingly.
- Optional (nice, cheap): port the host application's `IconLabel` idiom — icon-only buttons hover a
  gold small-caps *name* + hint detail — as a `MarkdownTooltip` content preset.

### 4.7 Everything else on the inventory (verify pass, mostly automatic)

Because chrome colors come from `divider`/`TINT`/`theme.custom.*`, these inherit the retint
and only need a visual check: recipe/safeguard chips + status chips (`builderStatusChipStyles`),
tag chips, badges (`badgeStyles`, `DirtyBadge`, `CircledDigitBadge`, group badges), HSF rules
table (header menus, selection rows), Gear Inspector grid + cards + `GridIconBox` (rarity
tints are data — unchanged), Gear Diff split view + delta chips, filter panel + preset
buttons, `EmptyStateMessage`, tutorial coach spotlight, drag overlays, splitter, update
notice, toasts (filled severity Alerts keep semantic colors; the custom success-alert
override in theme.ts gets re-checked against navy), progress indicators, color pickers
(swatches stay literal — documented exception), Manage Colors dialog, theme editor itself.

Charts: **data fills unchanged** (documented exception — legend↔slice correspondence). Chart
*frames* get the molding via their Paper wrappers; axis/grid hairlines move to `divider` gold
where they currently use neutral tints.

Explicitly untouched: easter-egg internals (theme-agnostic by rule), psychedelic mode
(hue-cycles whatever the theme provides — golds will cycle too, which is the point of the
gag), rarity/substat/slot data palettes, note DSL token colors.

---

## 5. Implementation phases

Each phase leaves the app shippable; run `typecheck` + `lint` + `build` + `test:unit`
(+ `test:e2e:chromium` where flows are touched) per phase.

1. **Tokens & palettes.** Gold vars through `themeCustomTokens`, `ThemeCustomization` fields,
   RSLH preset values, `buildSchemePalette` new bases (per Decision A), divider retint,
   `backgroundImage: 'none'`. Unit tests: extend `color-tints` / `theme-scheme-resolution`.
2. **Global chrome.** Paper molding, tooltip plate, scrollbars, shadow consolidation,
   outlined-input `notchedOutline` → divider (Decision D1).
3. **Tooltip content migration.** §4.6; delete the inverted-surface exception.
4. **Primitives & titles.** `GoldCornerOrnament`, `GoldSectionTitle`, dialog/menu/section
   title rollout, ornament placement per §4.3.
5. **Inventory sweep.** Walk §4.7 checklist screen-by-screen in all three schemes (+ the
   four color-blind modes ride along automatically since they only remap semantic colors).
6. **Theme editor + docs.** Gold pickers (Decision C), update
   `docs/technical/theming-system.md` (new tokens, changed exceptions), README screenshots if
   any show chrome.

---

## 6. Open decisions (recommendations inline above)

| # | Question | Recommendation |
|---|---|---|
| A | Adopt the host application's navy/parchment/cyan bases for Dark/Light, or keep SFC bases + gold only? | **A1: adopt wholesale** — it's the look being asked for |
| B | Ornament scope | Major panels + modal dialogs + floating note panel + egg flyouts; never menus/popovers/cards-in-grids |
| C | Gold colors user-editable in Theme Editor? | **Yes** (two pickers) |
| D | Gold hairlines on controls (inputs/chips/badges) too, or surfaces only? | **D1: full "resting hairline is the molding" rule** |
