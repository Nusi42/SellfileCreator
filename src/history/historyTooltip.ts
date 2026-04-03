import type { HistoryEntryDescriptor } from '../hooks/useSfcHistory'
import { resolveHistoryEntryDescriptor, type HistoryDescriptorResolveContext } from './historyDescriptorResolver'

/**
 * formatHistoryTooltipText
 *
 * Builds the tooltip string for history previews so undo/redo buttons can show
 * the pending action summary with bullet formatting.
 */
export function formatHistoryTooltipText(params: {
  descriptor: HistoryEntryDescriptor | null | undefined
  fallbackText: string
  shortcutHintText?: string
  t: HistoryDescriptorResolveContext['t']
  lang: HistoryDescriptorResolveContext['lang']
}): string {
  const { descriptor, fallbackText, t, lang } = params
  const resolved = resolveHistoryEntryDescriptor(descriptor ?? null, { t, lang })
  if (!resolved) return fallbackText
  const lines: string[] = []
  const title = resolved.title.trim()
  if (title.length > 0) {
    lines.push(title)
  }
  const detailLines = resolved.detailLines ?? null
  if (detailLines) {
    for (const detail of detailLines) {
      const trimmed = detail.trim()
      if (trimmed.length > 0) {
        const isStructuredPayload = trimmed.startsWith('{') && trimmed.endsWith('}')
        // Structured JSON blobs flow straight into BuilderTooltipContent so it can render icons;
        // prefix only the plain-text blocks with bullets to preserve the legacy list layout.
        lines.push(isStructuredPayload ? trimmed : `• ${trimmed}`)
      }
    }
  }
  return lines.join('\n')
}
