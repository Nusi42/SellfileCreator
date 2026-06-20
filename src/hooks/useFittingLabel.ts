// useFittingLabel — pick the widest label tier that fits the available row space,
// collapsing to icon-only (null) when even the narrowest tier overflows. Drives the
// export/push split button's progressive shortening: full → short → min → icon.
//
// Why a hook and not CSS: the tiers are *different strings* (and, across locales,
// different word orders), so there is nothing for `text-overflow: ellipsis` to do —
// we must measure each candidate and choose. Measurement is canvas-based
// (measureTextWidth) so trying N tiers costs no reflow.
//
// Why measure ROW SPACE, not the button's own box: CSS flex-wrap wraps an item to a new
// line *before* flex-shrink can squeeze it, so a self-sized button would wrap rather than
// shorten. Instead we compute the free space as the boundary row's content width minus its
// other children (the fixed action buttons) and the trailing chevron, then size the label
// to fit it. Summing the OTHER children (never our own group) keeps the budget independent
// of the current label, so there is no feedback loop and the box never latches to icon.
import * as React from 'react'
import { measureTextWidth } from '../lib/domMeasurements'

export interface FittingLabelOptions {
  // Ordered widest → narrowest. The first tier that fits within budget is chosen.
  tiers: readonly string[]
  // Space (CSS px) taken by the icon + the button's own paddings (label can't use it).
  reservedPx: number
  // Space (CSS px) taken by trailing fixed siblings inside the row after the button
  // (e.g. the split-button chevron + its gap) that eat into the available row width.
  trailingReservedPx?: number
  // The row whose right content edge bounds the available space — typically the action
  // group container the button lives in. Its right edge minus the button's left edge
  // (minus reserves) is the label budget.
  boundaryRef: React.RefObject<HTMLElement | null>
}

export interface FittingLabelResult {
  // The chosen tier text, or null when nothing fits (render icon-only).
  text: string | null
  // The width (CSS px) the FULL tier wants: full-label text + reservedPx. The caller
  // requests this as the wrapper's maxWidth so the button never grows past its natural
  // full size even when the row has slack to spare.
  idealWidth: number
  // Ref for the export group within the boundary row. The hook skips this child when
  // summing the row's other children, and reads its inner <button> for the canvas font.
  ref: React.RefObject<HTMLElement | null>
}

// Resolve the element whose font the label is rendered in (the inner MUI <button>), so
// measureTextWidth uses the right typography; fall back to the wrapper if not found yet.
function fontReference(wrapper: HTMLElement): HTMLElement {
  return (wrapper.querySelector('button') as HTMLElement | null) ?? wrapper
}

// Choose the widest tier whose measured width fits `available`, else null.
function chooseTier(
  tiers: readonly string[],
  reference: HTMLElement,
  available: number,
): string | null {
  // Tiers are widest-first; return the first that fits so we keep the most text.
  for (const tier of tiers) {
    if (measureTextWidth(tier, reference) <= available) return tier
  }
  // Even the narrowest overflows → caller collapses to icon-only.
  return null
}

export function useFittingLabel({
  tiers,
  reservedPx,
  trailingReservedPx = 0,
  boundaryRef,
}: FittingLabelOptions): FittingLabelResult {
  const ref = React.useRef<HTMLElement | null>(null)
  // Start at the full (widest) tier so first paint shows the most text; the measure
  // effect immediately corrects it if it does not fit.
  const [text, setText] = React.useState<string | null>(() => tiers[0] ?? null)
  // The full-tier footprint; seeded after first layout so the wrapper can cap its width.
  const [idealWidth, setIdealWidth] = React.useState(0)

  // Recompute the fitting tier (and the ideal full-tier width) from the free row space
  // between the wrapper's left edge and the boundary row's right content edge.
  const measure = React.useCallback(() => {
    const el = ref.current
    const boundary = boundaryRef.current
    if (!el || !boundary) return
    const fontEl = fontReference(el)
    // Available width = from the export wrapper's left edge to the boundary row's right
    // inner edge, minus the trailing chevron. The wrapper is the rightmost flexible item
    // (its left edge is fixed by the buttons to its left), and the boundary row is flex:1
    // so its right edge is viewport-driven, NOT content-driven — together these make the
    // budget independent of the current label (no feedback loop / latch).
    const bcs = window.getComputedStyle(boundary)
    // Free space = boundary row's content width minus every sibling in it that is NOT the
    // export group, minus inter-item gaps, minus the trailing chevron. Summing the OTHER
    // children (not our own wrapper) makes the budget independent of the current label — no
    // feedback loop — and needs no visual stretch on the export group itself.
    const rowContent =
      boundary.clientWidth - parseFloat(bcs.paddingLeft || '0') - parseFloat(bcs.paddingRight || '0')
    let siblingsWidth = 0
    let siblingCount = 0
    for (const child of Array.from(boundary.children)) {
      // Skip our own group (the child that contains the measured wrapper).
      if (child === el || (child as HTMLElement).contains(el)) continue
      siblingsWidth += (child as HTMLElement).offsetWidth
      siblingCount += 1
    }
    // Stack spacing renders as a column-gap; subtract one gap per inter-item boundary.
    const gap = parseFloat(bcs.columnGap || bcs.gap || '0') || 0
    const gaps = gap * Math.max(0, siblingCount) // gaps between siblings + before our group
    const freeForButton = rowContent - siblingsWidth - gaps - trailingReservedPx
    // Available text budget = free button width minus icon/own-padding reserve.
    const available = freeForButton - reservedPx
    const next = chooseTier(tiers, fontEl, available)
    // Ideal width = full tier's text width + the icon/padding reserve.
    const full = tiers[0] ? measureTextWidth(tiers[0], fontEl) + reservedPx : 0
    // Functional updates: skip the re-render when nothing changed (resize jitter). The
    // rule flags setState here because measure() runs synchronously in the layout effect
    // below — intended: the pre-paint fit avoids a wrong-width flash.
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setText((prev) => (prev === next ? prev : next))
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setIdealWidth((prev) => (Math.abs(prev - full) < 1 ? prev : Math.ceil(full)))
  }, [tiers, reservedPx, trailingReservedPx, boundaryRef])

  // Observe BOTH the wrapper and the boundary row so a change to either (panel resize,
  // sibling appearing, zoom, font swap) re-fits. useLayoutEffect commits the corrected
  // tier before paint, avoiding a wrong-width flash.
  React.useLayoutEffect(() => {
    const el = ref.current
    const boundary = boundaryRef.current
    if (!el) return
    measure()
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    if (boundary) observer.observe(boundary)
    return () => observer.disconnect()
  }, [measure, boundaryRef])

  return { text, idealWidth, ref }
}
