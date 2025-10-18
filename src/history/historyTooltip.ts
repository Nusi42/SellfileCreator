import type { HistoryEntryDescriptor } from '../hooks/useHsfcHistory'

/**
 * formatHistoryTooltipText
 *
 * Builds the tooltip string for history previews so undo/redo buttons can show
 * the pending action summary with bullet formatting and shortcut hints.
 */
export function formatHistoryTooltipText(params: {
  descriptor: HistoryEntryDescriptor | null | undefined
  fallbackText: string
  shortcutHintText: string
}): string {
  const { descriptor, fallbackText, shortcutHintText } = params
  if (!descriptor) {
    return fallbackText
  }
  const lines: string[] = []
  const title = descriptor.title.trim()
  if (title.length > 0) {
    lines.push(title)
  }
  const detailLines = descriptor.detailLines ?? null
  if (detailLines) {
    for (const detail of detailLines) {
      const trimmed = detail.trim()
      if (trimmed.length > 0) {
        lines.push(`• ${trimmed}`)
      }
    }
  }
  lines.push(shortcutHintText)
  return lines.join('\n')
}
