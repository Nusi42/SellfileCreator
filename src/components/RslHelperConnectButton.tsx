/**
 * RslHelperConnectButton
 *
 * Header button that reopens the app pre-connected to a local RSL Helper instance.
 * Left-click navigates to the deep-link URL.
 * Right-click opens a ContextMenuPaper popout for port configuration,
 * consistent with all other right-click surfaces in the app.
 */
import React, { useRef, useState } from 'react'
import { IconButton, Popover, TextField } from '@mui/material'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import ContextMenuTitle from './ContextMenuTitle'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import MarkdownTooltip from './MarkdownTooltip'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import { useI18n } from '../lib/i18n'
import {
  buildRslHelperConnectUrl,
  getRslHelperPort,
  RSL_HELPER_DEFAULT_PORT,
  RSL_HELPER_PORT_STORAGE_KEY,
} from '../lib/externalWsProtocol'

// Self-contained: manages its own port state so App.tsx does not need to know about it.
export default function RslHelperConnectButton() {
  const { t } = useI18n()

  // Port read from localStorage on mount; updated whenever the input contains a valid value.
  const [port, setPort] = useState<number>(() => getRslHelperPort())
  // Recompute the deep-link URL whenever the port changes.
  const connectUrl = React.useMemo(() => buildRslHelperConnectUrl(port), [port])

  // Anchor element stored in state so Popover receives a stable non-ref value during render.
  // (Accessing ref.current during render is forbidden by the react-hooks/refs lint rule.)
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null)
  const popoverOpen = popoverAnchor !== null
  const closePopover = () => setPopoverAnchor(null)

  // ContextMenuPaper requires a guard token + paper ref for outside-right-click cleanup.
  const portMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const { contextMenuGuard } = useContextMenuPaperGuard({
    open: popoverOpen,
    onClose: closePopover,
    menuRef: portMenuPaperRef,
  })

  // Right-click hint shown near the cursor until the user discovers the menu (once per version).
  const { shouldShow: showHint, markSeen: markHintSeen } = useContextMenuHint('rslHelperConnectButton')
  const [hintPos, setHintPos] = useState<{ x: number; y: number } | null>(null)
  // Active while hovering with the feature unseen; suppress once the popout is open.
  const hintActive = showHint && hintPos !== null && !popoverOpen

  // Raw string for the text field; lets the user type freely while we validate each change.
  const [draft, setDraft] = useState(String(port))

  // Parse and range-check without throwing; null means invalid.
  const parsedDraft = (() => {
    const n = parseInt(draft, 10)
    return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : null
  })()

  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    // Record that the user found the right-click feature so the hint stops showing.
    markHintSeen()
    setHintPos(null)
    // Reset draft to the current persisted value each time the popout opens.
    setDraft(String(port))
    setPopoverAnchor(e.currentTarget)
  }

  // Apply the port immediately on every valid keystroke — no Save button needed,
  // matching the pattern used by other config popouts (e.g. Last Used range).
  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setDraft(raw)
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1 || n > 65535) return
    // Keep localStorage clean: remove the key when restoring the default port.
    if (n === RSL_HELPER_DEFAULT_PORT) {
      localStorage.removeItem(RSL_HELPER_PORT_STORAGE_KEY)
    } else {
      localStorage.setItem(RSL_HELPER_PORT_STORAGE_KEY, String(n))
    }
    setPort(n)
  }

  // Compose the tooltip: primary action + right-click hint in italic below.
  const tooltipMd = `${t('connectRslHelper')}\n\n${t('connectRslHelperPortHint')}`

  return (
    <>
      <MarkdownTooltip markdown={tooltipMd}>
        <IconButton
          size="small"
          onClick={() => { window.location.href = connectUrl }}
          onContextMenu={handleContextMenu}
          onMouseMove={(e) => {
            // Track cursor so the hint overlay follows the pointer.
            if (showHint && !popoverOpen) setHintPos({ x: e.clientX, y: e.clientY })
          }}
          onMouseLeave={() => setHintPos(null)}
          aria-label={t('connectRslHelper')}
          sx={{ height: 34, width: 34, color: 'primary.main', border: '1px solid', borderColor: 'primary.main', borderRadius: 1, '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' } }}
        >
          <SmartToyOutlinedIcon fontSize="small" />
        </IconButton>
      </MarkdownTooltip>

      {/* Floating hint near the cursor — disappears once the user right-clicks */}
      <ContextMenuHintOverlay text={t('contextMenuHint')} position={hintActive ? hintPos : null} />

      {/* Port config popout — anchored to the button, uses the shared ContextMenuPaper X-close */}
      <Popover
        open={popoverOpen}
        anchorEl={popoverAnchor}
        onClose={closePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            ...buildContextMenuPaperSlotProps({
              component: ContextMenuPaper,
              contextMenuGuard,
              onRequestClose: closePopover,
              closeLabel: t('close'),
              // Generous right-padding to stay clear of the X-close button.
              sx: { px: 2, pt: 2, pb: 2, pr: 4, width: 260 },
            }),
            ref: portMenuPaperRef,
          },
        }}
      >
        <ContextMenuTitle title={t('rslHelperPortDialogTitle')} />
        {/* Port number field — changes apply immediately on every valid value;
            Enter closes the popout as a convenience shortcut. */}
        <TextField
          autoFocus
          label={t('rslHelperPortLabel')}
          helperText={t('rslHelperPortHelper')}
          type="number"
          inputProps={{ min: 1, max: 65535, step: 1 }}
          value={draft}
          onChange={handlePortChange}
          onKeyDown={(e) => { if (e.key === 'Enter' && parsedDraft !== null) closePopover() }}
          error={draft.trim() !== '' && parsedDraft === null}
          fullWidth
          variant="outlined"
          size="small"
          sx={{ mt: 1.5 }}
        />
      </Popover>
    </>
  )
}
