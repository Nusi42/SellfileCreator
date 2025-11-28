import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Tooltip, { type TooltipProps } from '@mui/material/Tooltip'
import { useForkRef } from '@mui/material/utils'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {
  MARKDOWN_TOOLTIP_INFO_ENTER_DELAY_MS,
  MARKDOWN_TOOLTIP_INTERACTIVE_ENTER_DELAY_MS,
  MARKDOWN_TOOLTIP_MAX_WIDTH_PX,
} from '../lib/constants'
import { hasEllipsisOverflow, pickEllipsisTarget } from '../lib/ellipsis'

/**
 * MarkdownTooltip
 *
 * Minimal wrapper around MUI Tooltip that accepts localized Markdown strings.
 * Why: Many tooltips share the same multi-line/bullet requirements and we want
 * a single implementation that enforces consistent spacing, width, and delay.
 */
export type TooltipHoverIntent = 'auto' | 'informational' | 'interactive'

// Inspect the immediate child element so hover timing can respond to interactive controls.
export function hasPrimaryPointerHandler(node: React.ReactNode): boolean {
  const stack: React.ReactNode[] = [node]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }
    if (!React.isValidElement(current)) continue
    const props = (current as React.ReactElement).props ?? {}
    if (
      ['onClick', 'onMouseDown', 'onPointerDown'].some(
        (handler) => typeof (props as Record<string, unknown>)[handler] === 'function',
      )
    ) {
      return true
    }
    const childrenArray = React.Children.toArray((props as { children?: React.ReactNode }).children)
    if (childrenArray.length > 0) {
      stack.push(...childrenArray)
    }
  }
  return false
}

export interface MarkdownTooltipProps extends Omit<TooltipProps, 'title'> {
  // Plain markdown string (default path). Useful for i18n copy.
  markdown?: string
  // Optional JSX renderer for rich/structured content (builder diff previews, set descriptions, etc.).
  render?: React.ReactNode | (() => React.ReactNode)
  maxWidth?: number
  // Optional label exposed via a native title attribute when the trigger text is ellipsized.
  ellipsisTitle?: string
  // Optional selector for the node that owns the ellipsis styles (defaults to `[data-ellipsis-target]`).
  ellipsisSelector?: string
  // Override the automatic delay heuristics. Only needed when the tooltip wraps deeply nested buttons.
  hoverIntent?: TooltipHoverIntent
}

type MarkdownSegment =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'list'; items: string[] }

const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g
// Inline renderer keeps parsing dead simple: we only care about the handful of tokens we expose to translators.

// Lightweight inline parser: handles bold/em/code without pulling in a full markdown runtime.
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  text.replace(INLINE_PATTERN, (match, _group, offset) => {
    if (typeof offset === 'number' && offset > lastIndex) {
      nodes.push(text.slice(lastIndex, offset))
    }
    const startsWithDouble = match.startsWith('**') || match.startsWith('__')
    const startsWithSingle = match.startsWith('*') || match.startsWith('_')
    const isCode = match.startsWith('`')
    const isStrong = startsWithDouble
    const isEmphasis = !isStrong && startsWithSingle
    const content = isCode
      ? match.slice(1, -1)
      : isStrong
      ? match.slice(2, -2)
      : match.slice(1, -1)
    if (isCode) {
      nodes.push(
        <Box
          key={`code-${offset}`}
          component="code"
          sx={{ fontFamily: 'var(--font-code, "JetBrains Mono", monospace)', fontSize: '0.85em', px: 0.5 }}
        >
          {content}
        </Box>,
      )
    } else if (isStrong) {
      nodes.push(
        <Box key={`strong-${offset}`} component="strong" sx={{ fontWeight: 600 }}>
          {content}
        </Box>,
      )
    } else if (isEmphasis) {
      nodes.push(
        <Box key={`em-${offset}`} component="em" sx={{ fontStyle: 'italic' }}>
          {content}
        </Box>,
      )
    } else {
      nodes.push(match)
    }
    lastIndex = (offset ?? 0) + match.length
    return match
  })
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes.length > 0 ? nodes : [text]
}

// Collapse the markdown string into either paragraphs or bullet segments so tooltips render predictable structure.
function segmentMarkdown(markdown: string): MarkdownSegment[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const segments: MarkdownSegment[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    segments.push({ type: 'paragraph', lines: paragraph })
    paragraph = []
  }

  const flushList = () => {
    if (list.length === 0) return
    segments.push({ type: 'list', items: list })
    list = []
  }

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph()
      list.push(trimmed.replace(/^[-*]\s+/, '').trim())
    } else {
      flushList()
      paragraph.push(raw.trimEnd())
    }
  }
  flushParagraph()
  flushList()
  return segments
}

export function renderMarkdownTooltipContent(markdown: string, options?: { maxWidth?: number }): React.ReactNode {
  const normalized = markdown.trim()
  if (!normalized) return ''
  const segments = segmentMarkdown(normalized)
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        ...(options?.maxWidth ? { maxWidth: options.maxWidth } : {}),
      }}
    >
      {segments.map((segment, idx) => {
        if (segment.type === 'list') {
          return (
            <Box
              component="ul"
              key={`list-${idx}`}
              sx={{ pl: 2.25, m: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}
            >
              {segment.items.map((item, lineIdx) => (
                <Box component="li" key={`list-${idx}-${lineIdx}`} sx={{ p: 0, listStylePosition: 'outside' }}>
                  <Typography variant="body2" component="span">
                    {parseInlineMarkdown(item)}
                  </Typography>
                </Box>
              ))}
            </Box>
          )
        }
        return (
          <Typography key={`para-${idx}`} variant="body2" component="p" sx={{ m: 0 }}>
            {segment.lines.flatMap((line, lineIdx) => {
              const parts = parseInlineMarkdown(line)
              if (lineIdx < segment.lines.length - 1) {
                return [...parts, <br key={`br-${idx}-${lineIdx}`} />]
              }
              return parts
            })}
          </Typography>
        )
      })}
    </Box>
  )
}

export function MarkdownTooltip({
  markdown,
  render,
  maxWidth,
  slotProps,
  enterDelay,
  placement,
  disableFocusListener = true,
  ellipsisTitle,
  ellipsisSelector,
  hoverIntent = 'auto',
  children,
  ...tooltipProps
}: MarkdownTooltipProps) {
  // Tooltip open state must be mirrored locally so we can forcibly close when the control disappears.
  const {
    open: openProp,
    onOpen: externalOnOpen,
    onClose: externalOnClose,
    ...restTooltipProps
  } = tooltipProps
  const isControlled = typeof openProp === 'boolean'
  const [internalOpen, setInternalOpen] = useState(false)
  const resolvedOpen = isControlled ? Boolean(openProp) : internalOpen
  const forceCloseUncontrolled = useCallback(() => {
    if (!isControlled) {
      setInternalOpen(false)
    }
  }, [isControlled])
  const handleTooltipOpen = useCallback<NonNullable<TooltipProps['onOpen']>>((event) => {
    externalOnOpen?.(event)
    if (!isControlled) {
      setInternalOpen(true)
    }
  }, [externalOnOpen, isControlled])
  const handleTooltipClose = useCallback<NonNullable<TooltipProps['onClose']>>((event) => {
    externalOnClose?.(event)
    forceCloseUncontrolled()
  }, [externalOnClose, forceCloseUncontrolled])

  // Pre-render Markdown content so we can hand JSX directly to MUI’s Tooltip.
  const content = useMemo(() => {
    if (typeof render === 'function') return render()
    if (render) return render
    const resolved = markdown ?? ''
    return renderMarkdownTooltipContent(resolved, { maxWidth: maxWidth ?? MARKDOWN_TOOLTIP_MAX_WIDTH_PX })
  }, [markdown, maxWidth, render])
  const resolvedPlacement = placement ?? 'top-start'
  // Track the rendered child element so we can monitor its visibility/hover state outside MUI.
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const scheduleRef = useRef<number | null>(null)
  const anchorCallback = useCallback((node: HTMLElement | null) => {
    setAnchorEl(node)
  }, [])
  const childRef = React.isValidElement(children)
    ? (children as React.ReactElement & { ref?: React.Ref<Element> }).ref ?? null
    : null
  const mergedChildRef = useForkRef(childRef, anchorCallback)
  const ellipsisEnabled = typeof ellipsisTitle === 'string' && ellipsisTitle.trim() !== ''
  const [showNativeEllipsisTitle, setShowNativeEllipsisTitle] = useState(false)
  useEffect(() => {
    if (!ellipsisEnabled && showNativeEllipsisTitle) {
      setShowNativeEllipsisTitle(false)
    }
  }, [ellipsisEnabled, showNativeEllipsisTitle])
  const applyEllipsisTitle = useCallback((root?: HTMLElement | null) => {
    if (!ellipsisEnabled || !root) {
      setShowNativeEllipsisTitle(false)
      return
    }
    const target = pickEllipsisTarget(root, ellipsisSelector)
    setShowNativeEllipsisTitle(hasEllipsisOverflow(target))
  }, [ellipsisEnabled, ellipsisSelector])
  const clearEllipsisTitle = useCallback(() => {
    if (!ellipsisEnabled) return
    setShowNativeEllipsisTitle(false)
  }, [ellipsisEnabled])
  const childWithRef = React.isValidElement(children)
    ? (() => {
        const originalProps = (children as React.ReactElement).props ?? {}
        const nextProps: Record<string, unknown> = { ref: mergedChildRef }
        if (ellipsisEnabled) {
          // Mirror EllipsisTooltip semantics: only surface the native title when hover/focus hits a
          // truncated label. This keeps MarkdownTooltip the single popper owner while still exposing
          // the full text for locales that overflow their inline container.
          nextProps.onMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
            originalProps.onMouseEnter?.(event)
            applyEllipsisTitle(event.currentTarget)
          }
          nextProps.onMouseLeave = (event: React.MouseEvent<HTMLElement>) => {
            originalProps.onMouseLeave?.(event)
            clearEllipsisTitle()
          }
          nextProps.onBlur = (event: React.FocusEvent<HTMLElement>) => {
            originalProps.onBlur?.(event)
            clearEllipsisTitle()
          }
        }
        return React.cloneElement(children as React.ReactElement, nextProps)
      })()
    : children
  const childHasPrimaryPointerHandler = useMemo(() => hasPrimaryPointerHandler(children), [children])
  const treatAsInteractive = hoverIntent === 'interactive' || (hoverIntent === 'auto' && childHasPrimaryPointerHandler)
  const resolvedEnterDelay = enterDelay ?? (treatAsInteractive
    ? MARKDOWN_TOOLTIP_INTERACTIVE_ENTER_DELAY_MS
    : MARKDOWN_TOOLTIP_INFO_ENTER_DELAY_MS)

  // Poll every animation frame while open: once the trigger is gone or no longer hovered/focused we close.
  useEffect(() => {
    if (!resolvedOpen) return undefined
    if (!anchorEl) {
      forceCloseUncontrolled()
      return undefined
    }
    if (typeof window === 'undefined') return undefined

    const checkAnchorVisibility = () => {
      const node = anchorEl
      if (!node || !node.isConnected) {
        forceCloseUncontrolled()
        return
      }
      const rects = node.getClientRects()
      if (rects.length === 0) {
        forceCloseUncontrolled()
        return
      }
      const style = window.getComputedStyle(node)
      const fullyTransparent = Number.parseFloat(style.opacity) === 0
      const pointerSuppressed = style.pointerEvents === 'none'
      if (style.visibility === 'hidden' || style.display === 'none' || fullyTransparent || pointerSuppressed) {
        forceCloseUncontrolled()
        return
      }
      const activeElement = typeof document !== 'undefined' ? document.activeElement : null
      const focusWithin = Boolean(activeElement && (node === activeElement || node.contains(activeElement)))
      const hovered = node.matches(':hover')
      if (!hovered && !focusWithin) {
        forceCloseUncontrolled()
        return
      }
      scheduleRef.current = window.requestAnimationFrame(checkAnchorVisibility)
    }
    scheduleRef.current = window.requestAnimationFrame(checkAnchorVisibility)
    return () => {
      if (scheduleRef.current) {
        window.cancelAnimationFrame(scheduleRef.current)
        scheduleRef.current = null
      }
    }
  }, [anchorEl, forceCloseUncontrolled, resolvedOpen])

  useEffect(() => {
    if (!ellipsisEnabled) return undefined
    const root = anchorEl
    if (!root) return undefined
    const target = pickEllipsisTarget(root, ellipsisSelector)
    if (showNativeEllipsisTitle) {
      target.setAttribute('title', ellipsisTitle ?? '')
    } else {
      target.removeAttribute('title')
    }
    return () => {
      target.removeAttribute('title')
    }
  }, [anchorEl, ellipsisEnabled, ellipsisSelector, ellipsisTitle, showNativeEllipsisTitle])

  return (
    <Tooltip
      arrow
      disableInteractive
      disableFocusListener={disableFocusListener}
      enterDelay={resolvedEnterDelay}
      placement={resolvedPlacement}
      {...(slotProps ? { slotProps } : {})}
      title={content}
      open={resolvedOpen}
      onOpen={handleTooltipOpen}
      onClose={handleTooltipClose}
      {...restTooltipProps}
    >
      {childWithRef}
    </Tooltip>
  )
}

export default MarkdownTooltip
