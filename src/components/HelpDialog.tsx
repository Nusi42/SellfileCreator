import React from 'react'
import { Dialog, DialogActions, DialogContent, Button, Box } from '@mui/material'
import MDEditor from '@uiw/react-md-editor'
import rehypeSanitize from 'rehype-sanitize'
import type { Pluggable } from 'unified'

// README content is bundled at build time. We render it read-only.
// Why: Keep user-facing docs accessible offline from within the app.
// Vite's ?raw import reads the file contents as a string.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite injects this import at build time
import README_MD from '../../README.md?raw'
import { APP_VERSION } from '../version'

export default function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rehypePluginsSafe = [rehypeSanitize as unknown as Pluggable]
  // Inject version into the README title line at render time.
  // Why: Keep the README.md in the repo clean and stable, but show users the app version contextually.
  const readmeWithVersion = React.useMemo(() => {
    try {
      const text = String(README_MD ?? '')
      const lines = text.split(/\r?\n/)
      const first = lines[0] ?? ''
      if (first.startsWith('# RSL Helper Sellfile Creator')) {
        // Insert a small version/author line under the title
        const badge = `###### v${APP_VERSION}`
        // Avoid duplicating if such a line already exists
        if ((lines[1] ?? '').startsWith('###### v')) {
          lines[1] = badge
        } else {
          lines.splice(1, 0, badge)
        }
        return lines.join('\n')
      }
      return text
    } catch {
      return String(README_MD ?? '')
    }
  }, [])

  return (
    <Dialog open={open} onClose={onClose} aria-label="Help / README" maxWidth="lg" fullWidth PaperProps={{ sx: { maxHeight: '84vh' } }}>
      <DialogContent dividers>
        <Box data-color-mode={('dark' as const)} sx={{ '& .wmde-markdown': { bgcolor: 'transparent', fontSize: 16, lineHeight: 1.7 } }}>
          <MDEditor.Markdown
            source={readmeWithVersion as unknown as string}
            rehypePlugins={rehypePluginsSafe as unknown as NonNullable<React.ComponentProps<typeof MDEditor.Markdown>['rehypePlugins']>}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
