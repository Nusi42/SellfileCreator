/**
 * AccountSwitcher
 *
 * Header control for the multi-account feature (lib/accounts.ts is the registry SSOT).
 * One shared component, two mount points (app header + simple-mode Note dialog) so both
 * entry points stay in sync per the parallel-entry-points rule.
 *
 * Click the button → account menu. Plain click on an account switches (writes the
 * registry, then reloads — one document per session, see lib/accounts.ts). Shift+click
 * offers the merge flow: the current document is staged as a one-shot carry and offered
 * to the target session through the existing shift-import options dialog, so merging
 * reuses the regular selective-import logic instead of forking it.
 */
import React, { useState } from 'react'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Divider, ListItemIcon, ListItemText, Menu, MenuItem, TextField, Typography,
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import AddIcon from '@mui/icons-material/Add'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import MarkdownTooltip from './MarkdownTooltip'
import { useI18n } from '../lib/i18n'
import { useAccounts } from '../state/useAccounts'
import {
  ACCOUNT_ACCENT_PALETTE,
  bindHelperAccount,
  createAccount,
  deleteAccount,
  renameAccount,
  setAccountAccent,
  stageAccountMergeCarry,
  switchAccount,
  type SfcAccount,
} from '../lib/accounts'

export type AccountSwitcherProps = {
  // Serializes the current document with the regular .sfc writer; staged as the
  // merge carry when the user shift-picks a target account.
  getMergeSfcText: () => string
  // Compact variant for the simple-mode Note dialog title bar (smaller button, no border).
  compact?: boolean
}

// Small round accent swatch; the raw user colour is fine as a *background* (it never
// renders as text, so no contrast adaptation is needed — same as other colour swatches).
function AccentDot({ color, size = 10 }: { color: string | undefined; size?: number }) {
  return (
    <Box
      component="span"
      sx={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
        bgcolor: color ?? 'text.disabled',
        // Hairline outline keeps light accents visible on light surfaces (and vice versa).
        border: '1px solid', borderColor: 'divider',
      }}
    />
  )
}

export default function AccountSwitcher({ getMergeSfcText, compact = false }: AccountSwitcherProps) {
  const { t } = useI18n()
  const { accounts, activeAccount } = useAccounts()

  // Menu anchor kept in state (not a ref) so the Menu gets a stable render-time value.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const menuOpen = menuAnchor !== null
  const closeMenu = () => setMenuAnchor(null)

  // Pending shift-merge target; non-null renders the confirmation dialog.
  const [mergeTarget, setMergeTarget] = useState<SfcAccount | null>(null)
  // Create-account dialog state; the draft feeds createAccount on confirm.
  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState('')
  // Manage dialog (rename / accent / unbind / delete) always targets the ACTIVE account —
  // switch first to manage another one; keeps the dialog free of cross-account foot-guns.
  const [manageOpen, setManageOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  // Two-step delete confirmation lives inside the manage dialog.
  const [deleteArmed, setDeleteArmed] = useState(false)

  // Full reload after any active-account change: one document per session (see lib/accounts.ts).
  const reload = () => { window.location.reload() }

  // Plain click switches; shift+click opens the merge confirmation instead.
  const handlePickAccount = (event: React.MouseEvent, account: SfcAccount) => {
    if (account.id === activeAccount.id) { closeMenu(); return }
    if (event.shiftKey) {
      setMergeTarget(account)
      closeMenu()
      return
    }
    switchAccount(account.id)
    reload()
  }

  // Stage the carry, then switch — the target session offers the import dialog on boot.
  const handleConfirmMerge = () => {
    if (!mergeTarget) return
    try {
      stageAccountMergeCarry({ fromDisplayName: activeAccount.displayName, sfcText: getMergeSfcText() })
    } catch {
      // Serialization failure: fall back to a plain switch rather than blocking it.
    }
    switchAccount(mergeTarget.id)
    reload()
  }

  const handleCreate = () => {
    const account = createAccount(createDraft)
    setCreateOpen(false)
    // Creating implies "start working on it" — switch straight into the new account.
    switchAccount(account.id)
    reload()
  }

  const handleDelete = () => {
    // deleteAccount reports whether the ACTIVE account changed (it always does here,
    // since the manage dialog only ever targets the active account) → reload.
    const needsReload = deleteAccount(activeAccount.id)
    setManageOpen(false)
    if (needsReload) reload()
  }

  // Bold state line + interaction help, mirroring the connect button's tooltip format.
  const tooltipMd = `**${t('accountSwitcherTooltip', { name: activeAccount.displayName })}**\n\n${t('accountMenuShiftHint')}`

  return (
    <>
      <MarkdownTooltip markdown={tooltipMd}>
        <Button
          size="small"
          variant={compact ? 'text' : 'outlined'}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          aria-label={t('accountSwitcherAriaLabel')}
          startIcon={<AccentDot color={activeAccount.accentColor} />}
          // Header variant matches the 34px control row; compact fits the dialog title bar.
          sx={{ height: compact ? 28 : 34, whiteSpace: 'nowrap', textTransform: 'none', maxWidth: 180 }}
        >
          {/* Ellipsize long names so the header row never overflows. */}
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeAccount.displayName}
          </Box>
        </Button>
      </MarkdownTooltip>

      <Menu anchorEl={menuAnchor} open={menuOpen} onClose={closeMenu}>
        {accounts.map((account) => (
          <MenuItem
            key={account.id}
            selected={account.id === activeAccount.id}
            onClick={(e) => handlePickAccount(e, account)}
          >
            <ListItemIcon><AccentDot color={account.accentColor} size={12} /></ListItemIcon>
            <ListItemText
              primary={account.displayName}
              // Bound accounts show the helper id so multi-account users can tell twins apart.
              secondary={account.helperAccountId ? t('accountBoundCaption', { id: account.helperAccountId }) : undefined}
              slotProps={{ secondary: { sx: { fontSize: '0.7rem' } } }}
            />
            {account.id === activeAccount.id && <CheckIcon fontSize="small" sx={{ ml: 1 }} />}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { closeMenu(); setCreateDraft(''); setCreateOpen(true) }}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('accountMenuNew')} />
        </MenuItem>
        <MenuItem onClick={() => { closeMenu(); setRenameDraft(activeAccount.displayName); setDeleteArmed(false); setManageOpen(true) }}>
          <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('accountMenuManage')} />
        </MenuItem>
        {/* Advertise the shift-merge affordance where the user is already looking. */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 0.5, maxWidth: 260 }}>
          {t('accountMenuShiftHint')}
        </Typography>
      </Menu>

      {/* Shift-merge confirmation — a content-changing action, so it names both sides. */}
      <Dialog open={mergeTarget !== null} onClose={() => setMergeTarget(null)}>
        <DialogTitle>{t('accountMergeTitle', { name: mergeTarget?.displayName ?? '' })}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('accountMergeBody', { source: activeAccount.displayName, target: mergeTarget?.displayName ?? '' })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeTarget(null)}>{t('cancel')}</Button>
          <Button variant="contained" onClick={handleConfirmMerge}>{t('accountMergeConfirm')}</Button>
        </DialogActions>
      </Dialog>

      {/* Create account — name only; accent is auto-assigned and editable via Manage. */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogTitle>{t('accountCreateTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" variant="outlined" sx={{ mt: 1 }}
            label={t('accountCreateNameLabel')}
            value={createDraft}
            onChange={(e) => setCreateDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && createDraft.trim()) handleCreate() }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('cancel')}</Button>
          <Button variant="contained" disabled={!createDraft.trim()} onClick={handleCreate}>
            {t('accountCreateConfirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manage the ACTIVE account: rename, accent, unbind, delete. */}
      <Dialog open={manageOpen} onClose={() => setManageOpen(false)}>
        <DialogTitle>{t('accountManageTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" variant="outlined" sx={{ mt: 1 }}
            label={t('accountManageRenameLabel')}
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            // Rename applies on blur/Enter — registry metadata only, no reload needed.
            onBlur={() => renameAccount(activeAccount.id, renameDraft)}
            onKeyDown={(e) => { if (e.key === 'Enter') renameAccount(activeAccount.id, renameDraft) }}
          />
          {/* Accent palette — fixed swatch row; the accent is an at-a-glance account marker. */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            {t('accountManageAccentLabel')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
            {ACCOUNT_ACCENT_PALETTE.map((color) => (
              <Box
                key={color}
                onClick={() => setAccountAccent(activeAccount.id, color)}
                sx={{
                  width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', bgcolor: color,
                  // Selected swatch gets a visible ring; others a hairline.
                  border: '2px solid',
                  borderColor: activeAccount.accentColor === color ? 'text.primary' : 'divider',
                }}
              />
            ))}
          </Box>
          {activeAccount.helperAccountId && (
            // Unbind releases the RSL Helper id without touching any stored data.
            <Button size="small" sx={{ mt: 2, textTransform: 'none' }}
              onClick={() => bindHelperAccount(activeAccount.id, undefined)}>
              {t('accountManageUnbind', { id: activeAccount.helperAccountId })}
            </Button>
          )}
          <Divider sx={{ my: 2 }} />
          {deleteArmed ? (
            <>
              <DialogContentText sx={{ mb: 1 }}>
                {t('accountManageDeleteConfirm', { name: activeAccount.displayName })}
              </DialogContentText>
              <Button color="error" variant="contained" size="small" onClick={handleDelete}>
                {t('accountManageDeleteConfirmButton')}
              </Button>
            </>
          ) : (
            // Deleting the last account is refused by deleteAccount; disable the entry point too.
            <Button color="error" size="small" disabled={accounts.length <= 1}
              onClick={() => setDeleteArmed(true)}>
              {t('accountManageDelete')}
            </Button>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManageOpen(false)}>{t('close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
