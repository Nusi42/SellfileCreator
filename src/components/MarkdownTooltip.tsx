import React, { useMemo } from 'react'
import Tooltip, { type TooltipProps } from '@mui/material/Tooltip'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {
  MARKDOWN_TOOLTIP_ENTER_DELAY_MS,
  MARKDOWN_TOOLTIP_MAX_WIDTH_PX,
} from '../lib/constants'

/**
 * MarkdownTooltip
 *
 * Minimal wrapper around MUI Tooltip that accepts localized Markdown strings.
 * Why: Many tooltips share the same multi-line/bullet requirements and we want
 * a single implementation that enforces consistent spacing, width, and delay.
 */
export interface MarkdownTooltipProps extends Omit<TooltipProps, 'title'> {
  // Plain markdown string (default path). Useful for i18n copy.
  markdown?: string
  // Optional JSX renderer for rich/structured content (builder diff previews, set descriptions, etc.).
  render?: React.ReactNode | (() => React.ReactNode)
  maxWidth?: number
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
  children,
  ...tooltipProps
}: MarkdownTooltipProps) {
  // Pre-render Markdown content so we can hand JSX directly to MUI’s Tooltip.
  const content = useMemo(() => {
    if (typeof render === 'function') return render()
    if (render) return render
    const resolved = markdown ?? ''
    return renderMarkdownTooltipContent(resolved, { maxWidth: maxWidth ?? MARKDOWN_TOOLTIP_MAX_WIDTH_PX })
  }, [markdown, maxWidth, render])
  const resolvedPlacement = placement ?? 'top-start'

  return (
    <Tooltip
      arrow
      disableInteractive
      enterDelay={enterDelay ?? MARKDOWN_TOOLTIP_ENTER_DELAY_MS}
      placement={resolvedPlacement}
      {...(slotProps ? { slotProps } : {})}
      title={content}
      {...tooltipProps}
    >
      {children}
    </Tooltip>
  )
}

export default MarkdownTooltip
