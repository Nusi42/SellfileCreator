// useFittingLabel — pick the widest label tier that fits the export action group's share of
// the header, collapsing to icon-only (null) when even the narrowest tier overflows. Drives
// the export/push button's progressive shortening: full → short → min → icon.
//
// Layout context: the action group is pinned to the right of the header, OUTSIDE the
// horizontal scroll region that holds the control groups + filter panel. So the label's
// budget is the header's total width minus (a) a reserved minimum for the scroll area (so
// the pinned action group never eats the whole header) and (b) the action group's own fixed
// buttons (history/load) + chevron. The control groups themselves scroll, so they are NOT
// subtracted — the label shrinks first, and scrolling is the last resort.
//
// Why canvas measurement: the tiers are *different strings* (different word orders across
// locales), so there is nothing for `text-overflow: ellipsis` to do — we measure each
// candidate (measureTextWidth) and choose, at no reflow cost.
import * as React from 'react'
import { measureTextWidth } from '../lib/domMeasurements'

export interface FittingLabelOptions {
  // Ordered widest → narrowest. The first tier that fits within budget is chosen.
  tiers: readonly string[]
  // Space (CSS px) taken by the icon + the button's own paddings (label can't use it).
  reservedPx: number
  // Space (CSS px) taken by the trailing chevron split-button (+ its gap) that shares the
  // action group with the label.
  trailingReservedPx?: number
  // Minimum width (CSS px) reserved for the scrollable area to the left of the action group,
  // so the pinned action group never consumes the entire header width.
  leadingReservedPx?: number
  // The header element whose client width is the total budget the action group draws from.
  viewportRef: React.RefObject<HTMLElement | null>
}

export interface FittingLabelResult {
  // The chosen tier text, or null when nothing fits (render icon-only).
  text: string | null
  // The width (CSS px) the FULL tier wants: full-label text + reservedPx. The caller caps
  // the export wrapper at this so the button never grows past its natural full size.
  idealWidth: number
  // Ref for the export wrapper (the action group's flexible child). The hook sums the action
  // group's OTHER children (the fixed buttons) and reads the inner <button> for the font.
  ref: React.RefObject<HTMLElement | null>
}

// Resolve the element whose font the label is rendered in (the inner MUI <button>), so
// measureTextWidth uses the right typography; fall back to the wrapper if not found yet.
function fontReference(wrapper: HTMLElement): HTMLElement {
  return (wrapper.querySelector('button') as HTMLElement | null) ?? wrapper
}

// Outer width including horizontal margins (offsetWidth omits them, but the fixed action
// buttons carry margins/gaps that consume real space).
function outerWidth(c: HTMLElement): number {
  const cs = window.getComputedStyle(c)
  return c.offsetWidth + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0)
}

// Choose the widest tier whose measured width fits `available`, else null.
function chooseTier(tiers: readonly string[], reference: HTMLElement, available: number): string | null {
  for (const tier of tiers) {
    if (measureTextWidth(tier, reference) <= available) return tier
  }
  return null
}

// A few px shaved off the budget so the label steps down a hair before the action group would
// be forced to overflow/shrink — absorbs sub-pixel rounding and un-modelled gaps.
const FIT_SAFETY_PX = 12

export function useFittingLabel({
  tiers,
  reservedPx,
  trailingReservedPx = 0,
  leadingReservedPx = 0,
  viewportRef,
}: FittingLabelOptions): FittingLabelResult {
  const ref = React.useRef<HTMLElement | null>(null)
  // Start at the full (widest) tier so first paint shows the most text; the measure effect
  // immediately corrects it if it does not fit.
  const [text, setText] = React.useState<string | null>(() => tiers[0] ?? null)
  // The full-tier footprint; seeded after first layout so the wrapper can cap its width.
  const [idealWidth, setIdealWidth] = React.useState(0)

  const measure = React.useCallback(() => {
    const el = ref.current
    const viewport = viewportRef.current
    if (!el || !viewport) return
    const fontEl = fontReference(el)
    // gapOf: the flex column-gap of a container (one gap per inter-item boundary).
    const gapOf = (container: HTMLElement): number => {
      const cs = window.getComputedStyle(container)
      return parseFloat(cs.columnGap || cs.gap || '0') || 0
    }
    // Sum the action group's fixed buttons (everything in el's parent except el itself).
    const group = el.parentElement
    let fixedWidth = 0
    if (group) {
      for (const child of Array.from(group.children)) {
        if (child === el || (child as HTMLElement).contains(el)) continue
        fixedWidth += outerWidth(child as HTMLElement)
      }
      fixedWidth += gapOf(group) * Math.max(0, group.children.length - 1)
    }
    // Sum the control groups (Filter/Sort/Diff) that share the control row with the action
    // group: everything in the row EXCEPT the action group itself and the flex-grow spacer.
    // Subtracting these is what makes the label shrink as the header narrows (so the controls
    // stay visible without scrolling); when even icon-only won't fit, the row scrolls.
    const row = group ? group.parentElement : null
    let controlsWidth = 0
    if (row) {
      let gaps = 0
      for (const child of Array.from(row.children)) {
        const c = child as HTMLElement
        if (c === group || c.contains(el)) continue // skip the action group
        if ((parseFloat(window.getComputedStyle(c).flexGrow) || 0) > 0) continue // skip spacer
        controlsWidth += outerWidth(c)
        gaps += 1
      }
      controlsWidth += gapOf(row) * Math.max(0, gaps)
    }
    // The export wrapper's own horizontal margins consume space too.
    const ownMargin = (() => {
      const cs = window.getComputedStyle(el)
      return (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0)
    })()
    const vcs = window.getComputedStyle(viewport)
    const viewportContent =
      viewport.clientWidth - parseFloat(vcs.paddingLeft || '0') - parseFloat(vcs.paddingRight || '0')
    const available =
      viewportContent - controlsWidth - leadingReservedPx - fixedWidth - ownMargin - trailingReservedPx - reservedPx - FIT_SAFETY_PX
    const next = chooseTier(tiers, fontEl, available)
    const full = tiers[0] ? measureTextWidth(tiers[0], fontEl) + reservedPx : 0
    // Functional updates: skip the re-render when nothing changed (resize jitter). The rule
    // flags setState because measure() runs synchronously in the layout effect below —
    // intended: the pre-paint fit avoids a wrong-width flash.
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setText((prev) => (prev === next ? prev : next))
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setIdealWidth((prev) => (Math.abs(prev - full) < 1 ? prev : Math.ceil(full)))
  }, [tiers, reservedPx, trailingReservedPx, leadingReservedPx, viewportRef])

  // Re-fit after EVERY render (no deps): a render is how React-state-driven layout changes
  // reach us — a sibling control toggling, a mode switch, or the label tier changing. The
  // header's width is unchanged in those cases, so a ResizeObserver alone would miss them.
  // measure() no-ops via functional setState when the tier is unchanged, so this cannot loop.
  React.useLayoutEffect(() => {
    measure()
  })

  // Plus a ResizeObserver for layout changes that DON'T re-render us — chiefly the preview
  // paper/panel being resized via its splitter. Observe the header viewport, the export
  // wrapper, and the action group's children.
  React.useLayoutEffect(() => {
    const el = ref.current
    const viewport = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    if (viewport) observer.observe(viewport)
    const group = el.parentElement
    if (group) for (const child of Array.from(group.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [measure, viewportRef])

  return { text, idealWidth, ref }
}
