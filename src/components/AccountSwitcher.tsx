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
 * reuses the regular selective-import logic instead of forking it. Each row's gear icon
 * opens the manager for THAT account (no switch needed) — rename, accent, the RSL Helper
 * id binding, per-account auto-push, the unstamped-data default flag, and deletion.
 */
import React, { useState } from 'react'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Divider, FormControlLabel, IconButton, ListItemIcon, ListItemText, Menu, MenuItem,
  Switch, TextField, Typography,
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
  setUnstampedDefaultAccount,
  stageAccountMergeCarry,
  switchAccount,
  type SfcAccount,
} from '../lib/accounts'
import {
  getSellfileAutoPushForAccount,
  setSellfileAutoPushForAccount,
} from '../state/exportPreferences'
import { usePersistEndpointGearPreference } from '../state/gearDbPreferences'

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
  // GLOBAL perf/sanity toggle surfaced in the manager (see state/gearDbPreferences.ts).
  const [persistEndpointGear, setPersistEndpointGear] = usePersistEndpointGearPreference()

  // Menu anchor kept in state (not a ref) so the Menu gets a stable render-time value.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const menuOpen = menuAnchor !== null
  const closeMenu = () => setMenuAnchor(null)

  // Pending shift-merge target; non-null renders the confirmation dialog.
  const [mergeTarget, setMergeTarget] = useState<SfcAccount | null>(null)
  // Create-account dialog state; the draft feeds createAccount on confirm.
  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState('')
  // Manager dialog: targets ANY account (row gear icon). Only the id is stored — the
  // live registry entry is re-derived each render so registry updates reflect instantly.
  const [manageTargetId, setManageTargetId] = useState<string | null>(null)
  const managedAccount = manageTargetId !== null
    ? accounts.find((a) => a.id === manageTargetId) ?? null
    : null
  const [renameDraft, setRenameDraft] = useState('')
  const [helperIdDraft, setHelperIdDraft] = useState('')
  // Auto-push is a raw scoped key (not registry state) — mirror it in local state.
  const [autoPushDraft, setAutoPushDraft] = useState(false)
  // Two-step delete confirmation lives inside the manager dialog.
  const [deleteArmed, setDeleteArmed] = useState(false)

  // Full reload after any active-account change: one document per session (see lib/accounts.ts).
  const reload = () => { window.location.reload() }

  // Seed the manager drafts for the picked account and open the dialog.
  const openManager = (account: SfcAccount) => {
    closeMenu()
    setManageTargetId(account.id)
    setRenameDraft(account.displayName)
    setHelperIdDraft(account.helperAccountId ?? '')
    setAutoPushDraft(getSellfileAutoPushForAccount(account.id))
    setDeleteArmed(false)
  }

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

  // Apply the helper-id field: trimmed value binds (releasing it from any other
  // account), empty unbinds. The id is treated as an opaque string, never parsed.
  const applyHelperIdDraft = () => {
    if (!managedAccount) return
    const trimmed = helperIdDraft.trim()
    if ((managedAccount.helperAccountId ?? '') === trimmed) return
    bindHelperAccount(managedAccount.id, trimmed || undefined)
  }

  const handleDelete = () => {
    if (!managedAccount) return
    // deleteAccount reports whether the ACTIVE account changed → then a reload is due.
    const needsReload = deleteAccount(managedAccount.id)
    setManageTargetId(null)
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
            {/* Manage THIS account without switching to it (rename, id, auto-push, …). */}
            <IconButton
              size="small"
              aria-label={t('accountMenuManage')}
              sx={{ ml: 1 }}
              onClick={(e) => { e.stopPropagation(); openManager(account) }}
            >
              <SettingsOutlinedIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { closeMenu(); setCreateDraft(''); setCreateOpen(true) }}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('accountMenuNew')} />
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

      {/* Manage ANY account: rename, accent, helper-id binding, per-account auto-push,
          the unstamped-data default flag, the global gear-persistence toggle, delete. */}
      <Dialog open={managedAccount !== null} onClose={() => setManageTargetId(null)}>
        <DialogTitle>{t('accountManageTitle')}</DialogTitle>
        {managedAccount && (
          <DialogContent>
            <TextField
              autoFocus fullWidth size="small" variant="outlined" sx={{ mt: 1 }}
              label={t('accountManageRenameLabel')}
              // The name IS the in-game player name: it routes name-identified data and
              // helper-sent names overwrite it (in-game renames propagate automatically).
              helperText={t('accountManageRenameHelper')}
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              // Rename applies on blur/Enter — registry metadata only, no reload needed.
              onBlur={() => renameAccount(managedAccount.id, renameDraft)}
              onKeyDown={(e) => { if (e.key === 'Enter') renameAccount(managedAccount.id, renameDraft) }}
            />
            {/* RSL Helper id binding — editable so accounts can be (re)bound by hand,
                e.g. before RSL Helper itself passes the id. Empty unbinds. */}
            <TextField
              fullWidth size="small" variant="outlined" sx={{ mt: 2 }}
              label={t('accountManageHelperIdLabel')}
              helperText={t('accountManageHelperIdHelper')}
              value={helperIdDraft}
              onChange={(e) => setHelperIdDraft(e.target.value)}
              onBlur={applyHelperIdDraft}
              onKeyDown={(e) => { if (e.key === 'Enter') applyHelperIdDraft() }}
            />
            {/* Per-account auto-push: the account's own contract with RSL Helper —
                also honored by the BACKGROUND push when this account is not active. */}
            <FormControlLabel
              sx={{ mt: 1.5, display: 'flex' }}
              control={(
                <Switch
                  size="small"
                  checked={autoPushDraft}
                  onChange={(e) => {
                    setAutoPushDraft(e.target.checked)
                    setSellfileAutoPushForAccount(managedAccount.id, e.target.checked)
                  }}
                />
              )}
              label={t('accountManageAutoPush')}
            />
            {/* Unstamped-data default: radio semantics — flagging here unflags others. */}
            <FormControlLabel
              sx={{ display: 'flex' }}
              control={(
                <Switch
                  size="small"
                  checked={managedAccount.unstampedDefault === true}
                  onChange={(e) => setUnstampedDefaultAccount(e.target.checked ? managedAccount.id : null)}
                />
              )}
              label={t('accountManageUnstampedDefault')}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
              {t('accountManageUnstampedDefaultHint')}
            </Typography>
            {/* Accent palette — fixed swatch row; the accent is an at-a-glance account marker. */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              {t('accountManageAccentLabel')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
              {ACCOUNT_ACCENT_PALETTE.map((color) => (
                <Box
                  key={color}
                  onClick={() => setAccountAccent(managedAccount.id, color)}
                  sx={{
                    width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', bgcolor: color,
                    // Selected swatch gets a visible ring; others a hairline.
                    border: '2px solid',
                    borderColor: managedAccount.accentColor === color ? 'text.primary' : 'divider',
                  }}
                />
              ))}
            </Box>
            <Divider sx={{ my: 2 }} />
            {/* GLOBAL toggle (all accounts): keep real gear data out of localStorage. */}
            <FormControlLabel
              sx={{ display: 'flex' }}
              control={(
                <Switch
                  size="small"
                  checked={persistEndpointGear}
                  onChange={(e) => setPersistEndpointGear(e.target.checked)}
                />
              )}
              label={t('accountManagePersistGear')}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
              {t('accountManagePersistGearHint')}
            </Typography>
            <Divider sx={{ my: 2 }} />
            {deleteArmed ? (
              <>
                <DialogContentText sx={{ mb: 1 }}>
                  {t('accountManageDeleteConfirm', { name: managedAccount.displayName })}
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
        )}
        <DialogActions>
          <Button onClick={() => setManageTargetId(null)}>{t('close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
