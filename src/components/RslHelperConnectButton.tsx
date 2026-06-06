/**
 * RslHelperConnectButton
 *
 * Header toggle that connects/disconnects the app from a local RSL Helper WebSocket instance.
 * State is reflected visually on the robot icon: off (outlined), connecting (pulsing + spinner
 * badge), connected (success fill + dot badge).
 * Left-click toggles the connection. Right-click opens a ContextMenuPaper popout for port
 * configuration, consistent with all other right-click surfaces in the app.
 */
import React, { useRef, useState } from 'react'
import { Box, Button, CircularProgress, IconButton, Popover, TextField } from '@mui/material'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import ContextMenuTitle from './ContextMenuTitle'
import { CONTEXT_HINT_IDS } from '../hooks/contextMenuHintIds'
import { useContextMenuButtonHint } from '../hooks/useContextMenuButtonHint'
import MarkdownTooltip from './MarkdownTooltip'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useI18n } from '../lib/i18n'
import {
  getRslHelperPort,
  RSL_HELPER_DEFAULT_PORT,
  RSL_HELPER_PORT_STORAGE_KEY,
} from '../lib/externalWsProtocol'

export type RslHelperConnectButtonProps = {
  // Whether the user has toggled the connection on.
  connectEnabled: boolean
  // Whether the WebSocket is currently open and confirmed reachable.
  pushEndpointReachable: boolean
  // Called when the user clicks the button to toggle the connection.
  onToggleConnect: () => void
  // When true, renders as a Button with icon+text instead of a bare IconButton.
  // Used by HelpDialog to embed a labelled version in the dialog actions row.
  showLabel?: boolean
}

export default function RslHelperConnectButton({
  connectEnabled,
  pushEndpointReachable,
  onToggleConnect,
  showLabel = false,
}: RslHelperConnectButtonProps) {
  const { t } = useI18n()

  // Port read from localStorage on mount; updated whenever the input contains a valid value.
  const [port, setPort] = useState<number>(() => getRslHelperPort())

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
  const connectHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.rslHelperConnectButton, {
    enabled: !popoverOpen,
    text: t('contextMenuHint'),
  })

  // Raw string for the text field; lets the user type freely while we validate each change.
  const [draft, setDraft] = useState(String(port))

  // Parse and range-check without throwing; null means invalid.
  const parsedDraft = (() => {
    const n = parseInt(draft, 10)
    return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : null
  })()

  // Derive the visual state from the combination of enabled + reachable.
  const connectState = !connectEnabled ? 'off' : pushEndpointReachable ? 'connected' : 'connecting'

  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    connectHint.onOpen()
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

  // Label text changes with state.
  const primaryTooltip =
    connectState === 'connected' ? t('connectRslHelperConnected')
    : connectState === 'connecting' ? t('connectRslHelperConnecting')
    : t('connectRslHelper')
  // Tooltip = bold state label + click-action sentence + port hint.
  // The action strings are separate i18n keys; the state description is reused from primaryTooltip.
  const clickAction =
    connectState === 'connected' ? t('connectRslHelperClickDisconnect')
    : connectState === 'connecting' ? t('connectRslHelperClickCancel')
    : t('connectRslHelperClickConnect')
  const tooltipMd = `**${primaryTooltip}**\n\n${clickAction}\n\n${t('connectRslHelperPortHint')}`


  // Icon with badge overlay shared between the IconButton and Button rendering paths.
  const iconWithBadge = (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <SmartToyOutlinedIcon fontSize="small" />
      {connectState === 'connecting' && (
        // Spinner anchored to the bottom-right corner of the icon.
        <CircularProgress size={10} sx={{ position: 'absolute', bottom: -3, right: -3, color: 'primary.main' }} />
      )}
      {connectState === 'connected' && (
        // Solid dot anchored to the bottom-right corner; white fill inside a green ring.
        <Box sx={{ position: 'absolute', bottom: -2, right: -2, width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.contrastText', border: '1.5px solid', borderColor: 'success.main' }} />
      )}
    </Box>
  )

  // Pulse animation shared between both rendering paths.
  const pulseSx = connectState === 'connecting'
    ? { '@keyframes rslPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.45 } }, animation: 'rslPulse 1.4s ease-in-out infinite' }
    : {}

  return (
    <>
      {showLabel ? (
        // Labelled variant used in HelpDialog: icon + state text + tooltip.
        <MarkdownTooltip markdown={tooltipMd}>
          <Button
            size="small"
            variant={connectState === 'connected' ? 'contained' : 'outlined'}
            color={connectState === 'connected' ? 'success' : 'primary'}
            onClick={onToggleConnect}
            onContextMenu={handleContextMenu}
            {...connectHint.triggerProps}
            startIcon={iconWithBadge}
            aria-label={primaryTooltip}
            sx={{ whiteSpace: 'nowrap', ...pulseSx }}
          >
            {primaryTooltip}
          </Button>
        </MarkdownTooltip>
      ) : (
        // Icon-only variant used in the toolbar.
        <MarkdownTooltip markdown={tooltipMd}>
          <IconButton
            size="small"
            onClick={onToggleConnect}
            onContextMenu={handleContextMenu}
            {...connectHint.triggerProps}
            aria-label={primaryTooltip}
            sx={{
              height: 34, width: 34, border: '1px solid', borderRadius: 1,
              // Colour scheme shifts with connection state.
              ...(connectState === 'connected'
                ? { bgcolor: 'success.main', borderColor: 'success.main', color: 'success.contrastText', '&:hover': { bgcolor: 'success.dark', borderColor: 'success.dark', color: 'success.contrastText' } }
                : connectState === 'connecting'
                ? { color: 'primary.main', borderColor: 'primary.main', ...pulseSx }
                : { color: 'primary.main', borderColor: 'primary.main', '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' } }),
            }}
          >
            {iconWithBadge}
          </IconButton>
        </MarkdownTooltip>
      )}

      {/* Floating hint near the cursor — disappears once the user right-clicks */}
      {connectHint.overlay}

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
          slotProps={{ htmlInput: { min: 1, max: 65535, step: 1 } }}
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
