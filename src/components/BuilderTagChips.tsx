// Shared tag chip primitives used by RecipeBuilderPanel and SafeguardBuilderPanel.
// Double-click-to-copy is defined once here and applied to every tag chip.

import { Chip, Box, Typography } from '@mui/material'
import type { SxProps } from '@mui/material'
import { writeTextSafe, triggerCopyDialog } from '../lib/clipboard'

// Falls back to the manual copy dialog when the Clipboard API is unavailable.
function copyTagToClipboard(tag: string): void {
  writeTextSafe(tag).then(ok => { if (!ok) triggerCopyDialog(tag) })
}

export interface BuilderTagChipStripProps {
  tags: string[]
  /** Tags present in some but not all selected items (multi-edit mixed state). */
  mixedTagSet?: ReadonlySet<string>
  /** Sx applied to chips whose tag is in mixedTagSet. */
  mixedTagChipSx?: SxProps
  multiEditActive?: boolean
}

/**
 * Up to 3 named tag chips + a "+N" overflow badge.
 * Renders as a fragment — the caller controls the flex container.
 * No delete affordance; double-click copies the tag text to the clipboard.
 */
export function BuilderTagChipStrip({ tags, mixedTagSet, mixedTagChipSx, multiEditActive }: BuilderTagChipStripProps) {
  return (
    <>
      {tags.slice(0, 3).map((tag) => (
        <Chip
          key={tag}
          size="small"
          label={tag}
          sx={{
            maxWidth: 120,
            ...(multiEditActive && mixedTagSet?.has(tag) ? mixedTagChipSx : null),
          }}
          onDoubleClick={(e) => { e.stopPropagation(); copyTagToClipboard(tag) }}
        />
      ))}
      {tags.length > 3 ? (
        <Chip size="small" label={`+${tags.length - 3}`} sx={{ opacity: 0.7 }} />
      ) : null}
    </>
  )
}

export interface BuilderTagChipListProps {
  tags: string[]
  mixedTagSet?: ReadonlySet<string>
  mixedTagChipSx?: SxProps
  multiEditActive?: boolean
  onRemove: (tag: string) => void
  /** Shown when tags is empty. */
  emptyLabel: string
}

/**
 * Full removable chip list for the tags popover.
 * Wraps in a flex Box so callers can drop it directly into a Stack or Box.
 * Double-click copies the tag text; the delete icon fires onRemove.
 */
export function BuilderTagChipList({ tags, mixedTagSet, mixedTagChipSx, multiEditActive, onRemove, emptyLabel }: BuilderTagChipListProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {tags.length > 0 ? (
        tags.map((tag) => (
          <Chip
            key={tag}
            size="small"
            label={tag}
            onDelete={() => onRemove(tag)}
            onDoubleClick={(e) => { e.stopPropagation(); copyTagToClipboard(tag) }}
            {...(multiEditActive && mixedTagSet?.has(tag) ? { sx: mixedTagChipSx } : {})}
          />
        ))
      ) : (
        <Typography variant="caption" color="text.secondary">
          {emptyLabel}
        </Typography>
      )}
    </Box>
  )
}
