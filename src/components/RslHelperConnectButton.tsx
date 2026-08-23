/**
 * RslHelperConnectButton
 *
 * Header toggle that connects/disconnects the app from a local RSL Helper WebSocket instance.
 * State is reflected visually on the robot icon: off (outlined), connecting (pulsing + spinner
 * badge), connected (success fill + dot badge).
 * Left-click toggles the connection. Right-click opens a ContextMenuPaper popout for port
 * configuration, consistent with all other right-click surfaces in the app.
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Box, Button, CircularProgress, IconButton, Popover, TextField } from '@mui/material'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { NumberSpinnerAdornment, HIDE_NATIVE_NUMBER_SPINNER_SX } from './NumberSpinnerAdornment'
import ContextMenuTitle from './ContextMenuTitle'
import { CONTEXT_HINT_IDS } from '../hooks/contextMenuHintIds'
import { useContextMenuButtonHint } from '../hooks/useContextMenuButtonHint'
import MarkdownTooltip from './MarkdownTooltip'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useI18n } from '../lib/i18n'
import {
  clampRslHelperPort,
  getRslHelperPort,
  parseRslHelperPort,
  setRslHelperPort as persistRslHelperPort,
  subscribeRslHelperPort,
  RSL_HELPER_PORT_MIN,
  RSL_HELPER_PORT_MAX,
} from '../lib/externalWsProtocol'

// Debounced live-apply interval for the port field: long enough that normal typing does
// not commit intermediate ports (each commit can re-target a live connection), short
// enough that the connection state reacts soon after the user stops typing.
const RSL_HELPER_PORT_COMMIT_DEBOUNCE_MS = 800 as const

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

  // The committed port, read through the writer's subscription (externalWsProtocol SSOT) so
  // every button instance (header, HelpDialog, NoteDialog) mirrors the port in use without
  // a local copy that could drift when another instance commits.
  const port = useSyncExternalStore(subscribeRslHelperPort, getRslHelperPort)

  // Anchor element stored in state so Popover receives a stable non-ref value during render.
  // (Accessing ref.current during render is forbidden by the react-hooks/refs lint rule.)
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null)
  const popoverOpen = popoverAnchor !== null
  // Raw close (state reset only) — commit/cancel semantics live in the callers below.
  const closePopover = () => setPopoverAnchor(null)

  // Raw string for the text field; lets the user type freely while we validate each change.
  const [draft, setDraft] = useState(String(port))

  // Parse and range-check without throwing; null means invalid. Shared parser so the field,
  // the storage reader, and the launch-param migration agree on what a valid port is.
  const parsedDraft = parseRslHelperPort(draft)

  // Port in force when the popout opened — the Esc cancel restores it even when a
  // debounced live-apply already committed a newer value mid-edit.
  const portAtOpenRef = useRef(port)
  // Pending debounced live-apply (timer + the valid port it will commit); null when nothing
  // is scheduled. The value rides along so a flush can commit it without re-parsing.
  const pendingCommitRef = useRef<{ timer: ReturnType<typeof setTimeout>; port: number } | null>(null)
  // Drop the scheduled live-apply without committing it.
  const clearPendingCommit = useCallback(() => {
    if (pendingCommitRef.current === null) return
    clearTimeout(pendingCommitRef.current.timer)
    pendingCommitRef.current = null
  }, [])
  // Commit the scheduled live-apply NOW instead of waiting out the debounce (no-op when
  // nothing is pending — so the blur that follows an Esc cancel stays inert).
  const flushPendingCommit = useCallback(() => {
    const pending = pendingCommitRef.current
    if (pending === null) return
    clearPendingCommit()
    // Shared writer: clears the key on the default port, is storage-throw safe, and
    // notifies App's endpoint subscription so a live connection re-targets.
    persistRslHelperPort(pending.port)
  }, [clearPendingCommit])
  // Unmount (e.g. the HelpDialog closing within the debounce) is an ordinary dismissal like
  // the outside click, so a pending live-apply is flushed rather than lost.
  useEffect(() => flushPendingCommit, [flushPendingCommit])

  // Commit-and-close for every ordinary dismissal (outside click, the X-close, Enter).
  // An invalid draft cannot be committed — it is discarded, and the last valid commit
  // (or the pre-open port) stays in force.
  const commitAndClosePopover = () => {
    clearPendingCommit()
    if (parsedDraft !== null) persistRslHelperPort(parsedDraft)
    closePopover()
  }

  // Esc cancel: discard the draft AND roll back any debounced live-apply that already
  // fired mid-edit — the port in force when the popout opened is restored (the writer
  // no-ops when nothing was committed).
  const cancelPopover = () => {
    clearPendingCommit()
    persistRslHelperPort(portAtOpenRef.current)
    closePopover()
  }

  // ContextMenuPaper requires a guard token + paper ref for outside-right-click cleanup.
  // Outside RIGHT-click dismisses like any other outside click → commit (the hook reads
  // onClose through a ref, so the freshest draft is the one committed).
  const portMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const { contextMenuGuard } = useContextMenuPaperGuard({
    open: popoverOpen,
    onClose: commitAndClosePopover,
    menuRef: portMenuPaperRef,
  })

  // Right-click hint shown near the cursor until the user discovers the menu (once per version).
  const connectHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.rslHelperConnectButton, {
    enabled: !popoverOpen,
    text: t('contextMenuHint'),
  })

  // Derive the visual state from the combination of enabled + reachable.
  const connectState = !connectEnabled ? 'off' : pushEndpointReachable ? 'connected' : 'connecting'

  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    connectHint.onOpen()
    // The draft always starts at the port in use (a cancelled edit must never resurface),
    // and the Esc rollback target is captured at the same moment.
    portAtOpenRef.current = port
    setDraft(String(port))
    setPopoverAnchor(e.currentTarget)
  }

  // Draft edit shared by typing and the spinner. A valid value schedules a debounced
  // live-apply, so the port takes effect (and a live connection re-targets) shortly after
  // the user stops typing — no close needed; Esc still rolls it back. An invalid
  // intermediate only cancels the pending apply; it is never committed (each commit can
  // re-target a live connection, so intermediate digits must not reach the writer).
  const applyDraftValue = (raw: string) => {
    setDraft(raw)
    clearPendingCommit()
    const n = parseRslHelperPort(raw)
    if (n === null) return
    const timer = setTimeout(flushPendingCommit, RSL_HELPER_PORT_COMMIT_DEBOUNCE_MS)
    pendingCommitRef.current = { timer, port: n }
  }
  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => applyDraftValue(e.target.value)
  // Spinner steps edit the draft too; an invalid draft steps from the committed port.
  const stepPort = (delta: number) => {
    const base = parsedDraft ?? port
    applyDraftValue(String(clampRslHelperPort(base + delta)))
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
        // Backdrop (outside) click is an ordinary close → commit; Esc is the deliberate
        // cancel gesture → discard the draft and roll back any mid-edit live-apply.
        onClose={(_event, reason) => {
          if (reason === 'escapeKeyDown') cancelPopover()
          else commitAndClosePopover()
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            // eslint-disable-next-line react-hooks/refs -- commitAndClosePopover reaches the pending-commit ref, but ContextMenuPaper only invokes onRequestClose from the X-close click (event time), never during render
            ...buildContextMenuPaperSlotProps({
              component: ContextMenuPaper,
              contextMenuGuard,
              // The X-close is an ordinary close gesture, so it commits like the backdrop.
              onRequestClose: commitAndClosePopover,
              closeLabel: t('close'),
              // Generous right-padding to stay clear of the X-close button.
              sx: { px: 2, pt: 2, pb: 2, pr: 4, width: 260 },
            }),
            ref: portMenuPaperRef,
          },
        }}
      >
        <ContextMenuTitle title={t('rslHelperPortDialogTitle')} />
        {/* Port number field — edits live-apply after a short pause (debounce above);
            Enter commits and closes immediately; Esc cancels and rolls back. */}
        <TextField
          autoFocus
          label={t('rslHelperPortLabel')}
          helperText={t('rslHelperPortHelper')}
          type="number"
          slotProps={{
            htmlInput: { min: RSL_HELPER_PORT_MIN, max: RSL_HELPER_PORT_MAX, step: 1 },
            // Shared custom spinner (SSOT with the Minima/Roll-Targets inputs) in place
            // of the browser-native number arrows.
            input: {
              endAdornment: (
                <NumberSpinnerAdornment
                  ariaLabel={t('rslHelperPortLabel')}
                  onStep={stepPort}
                />
              ),
              sx: { ...HIDE_NATIVE_NUMBER_SPINNER_SX },
            },
          }}
          value={draft}
          onChange={handlePortChange}
          // Blur flushes a pending live-apply immediately; inert when nothing is pending.
          onBlur={flushPendingCommit}
          onKeyDown={(e) => { if (e.key === 'Enter') commitAndClosePopover() }}
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
