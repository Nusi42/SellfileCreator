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
 * reuses the regular selective-import logic instead of forking it. Each row shows the
 * account's saved-at/counts summary (preset-menu style) and carries a gear icon opening
 * the account dialog for THAT account. "New account…" opens the SAME dialog in create
 * mode (staged fields, "Create & switch"), so both flows share one look and feel.
 */
import React, { useMemo, useState } from 'react'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Divider, FormControlLabel, IconButton, ListItemIcon, Menu, MenuItem,
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
  pickDefaultAccent,
  renameAccount,
  setAccountAccent,
  setUnstampedDefaultAccount,
  stageAccountMergeCarry,
  switchAccount,
  type SfcAccount,
} from '../lib/accounts'
import { readAccountListSummary } from '../lib/accountSummaries'
import { formatLocalDateTime } from '../lib/dateDisplay'
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

// The account dialog serves both flows: 'create' stages values until confirmation,
// 'manage' edits the identified account live (registry updates re-render instantly).
type AccountDialogState = { mode: 'create' } | { mode: 'manage'; accountId: string } | null

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

  // Per-account saved-at/counts, computed lazily on each menu open (the SFC summary
  // needs a full document parse per account — cheap enough at menu-open frequency).
  const accountSummaries = useMemo(() => {
    if (!menuOpen) return new Map<string, ReturnType<typeof readAccountListSummary>>()
    return new Map(accounts.map((account) => [account.id, readAccountListSummary(account.id)]))
  }, [menuOpen, accounts])

  // Compose the preset-menu-style caption: "saved-at · N recipes · M gear items".
  const summaryCaption = (accountId: string): string | null => {
    const summary = accountSummaries.get(accountId)
    if (!summary) return null
    const parts = [
      summary.savedAt ? formatLocalDateTime(summary.savedAt) : null,
      summary.recipeCount !== null ? t('accountSummaryRecipes', { count: summary.recipeCount }) : null,
      summary.gearItemCount !== null ? t('accountSummaryGearItems', { count: summary.gearItemCount }) : null,
    ].filter((part): part is string => Boolean(part))
    return parts.length > 0 ? parts.join(' · ') : null
  }

  // Pending shift-merge target; non-null renders the confirmation dialog.
  const [mergeTarget, setMergeTarget] = useState<SfcAccount | null>(null)
  // The unified account dialog (create or manage) + its staged/managed field drafts.
  const [accountDialog, setAccountDialog] = useState<AccountDialogState>(null)
  const managedAccount = accountDialog?.mode === 'manage'
    ? accounts.find((a) => a.id === accountDialog.accountId) ?? null
    : null
  const [nameDraft, setNameDraft] = useState('')
  const [playerIdDraft, setPlayerIdDraft] = useState('')
  // Auto-push is a raw scoped key (not registry state) — mirrored in local state.
  const [autoPushDraft, setAutoPushDraft] = useState(false)
  // Create-mode-only staged values (manage mode applies these live instead).
  const [accentDraft, setAccentDraft] = useState<string>(ACCOUNT_ACCENT_PALETTE[0]!)
  const [unstampedDraft, setUnstampedDraft] = useState(false)
  // Two-step delete confirmation lives inside the manage dialog.
  const [deleteArmed, setDeleteArmed] = useState(false)

  // Full reload after any active-account change: one document per session (see lib/accounts.ts).
  const reload = () => { window.location.reload() }

  // Seed drafts for the picked account and open the dialog in manage mode.
  const openManage = (account: SfcAccount) => {
    closeMenu()
    setNameDraft(account.displayName)
    setPlayerIdDraft(account.helperAccountId ?? '')
    setAutoPushDraft(getSellfileAutoPushForAccount(account.id))
    setDeleteArmed(false)
    setAccountDialog({ mode: 'manage', accountId: account.id })
  }

  // Blank drafts (accent pre-picked like createAccount would) and open in create mode.
  const openCreate = () => {
    closeMenu()
    setNameDraft('')
    setPlayerIdDraft('')
    setAutoPushDraft(false)
    setAccentDraft(pickDefaultAccent(accounts.length))
    setUnstampedDraft(false)
    setAccountDialog({ mode: 'create' })
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

  // Create mode confirmation: apply every staged field, then switch into the account.
  const handleCreate = () => {
    const account = createAccount(nameDraft)
    const trimmedId = playerIdDraft.trim()
    if (trimmedId) bindHelperAccount(account.id, trimmedId)
    setAccountAccent(account.id, accentDraft)
    if (autoPushDraft) setSellfileAutoPushForAccount(account.id, true)
    if (unstampedDraft) setUnstampedDefaultAccount(account.id)
    setAccountDialog(null)
    // Creating implies "start working on it" — switch straight into the new account.
    switchAccount(account.id)
    reload()
  }

  // Manage mode: the Player ID field applies on blur/Enter; empty unbinds.
  const applyPlayerIdDraft = () => {
    if (!managedAccount) return
    const trimmed = playerIdDraft.trim()
    if ((managedAccount.helperAccountId ?? '') === trimmed) return
    bindHelperAccount(managedAccount.id, trimmed || undefined)
  }

  const handleDelete = () => {
    if (!managedAccount) return
    // deleteAccount reports whether the ACTIVE account changed → then a reload is due.
    const needsReload = deleteAccount(managedAccount.id)
    setAccountDialog(null)
    if (needsReload) reload()
  }

  // Bold state line + interaction help, mirroring the connect button's tooltip format.
  const tooltipMd = `**${t('accountSwitcherTooltip', { name: activeAccount.displayName })}**\n\n${t('accountMenuShiftHint')}`
  const isCreate = accountDialog?.mode === 'create'
  // The dialog renders for create mode OR a still-existing managed account.
  const dialogOpen = accountDialog !== null && (isCreate || managedAccount !== null)
  // Accent shown in the dialog: staged value in create mode, live registry value in manage.
  const dialogAccent = isCreate ? accentDraft : managedAccount?.accentColor
  // Caption style shared with the preset menus (see PreviewHeaderActions rows).
  const captionSx = { lineHeight: 1.3, color: 'text.secondary', opacity: 0.78 } as const

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
            {/* Preset-menu row layout: name line + caption lines (Player ID, summary). */}
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="body2" noWrap>{account.displayName}</Typography>
              {account.helperAccountId ? (
                <Typography variant="caption" noWrap sx={captionSx}>
                  {t('accountBoundCaption', { id: account.helperAccountId })}
                </Typography>
              ) : null}
              {summaryCaption(account.id) ? (
                <Typography variant="caption" noWrap sx={captionSx}>
                  {summaryCaption(account.id)}
                </Typography>
              ) : null}
            </Box>
            {account.id === activeAccount.id && <CheckIcon fontSize="small" sx={{ ml: 1 }} />}
            {/* Manage THIS account without switching to it (name, id, auto-push, …). */}
            <IconButton
              size="small"
              aria-label={t('accountMenuManage')}
              sx={{ ml: 1 }}
              onClick={(e) => { e.stopPropagation(); openManage(account) }}
            >
              <SettingsOutlinedIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={openCreate}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          {t('accountMenuNew')}
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

      {/* The unified account dialog: identical layout for create (staged) and manage (live). */}
      <Dialog open={dialogOpen} onClose={() => setAccountDialog(null)}>
        <DialogTitle>{isCreate ? t('accountCreateTitle') : t('accountManageTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" variant="outlined" sx={{ mt: 1 }}
            label={isCreate ? t('accountCreateNameLabel') : t('accountManageRenameLabel')}
            // The name IS the in-game player name: it routes name-identified data and
            // helper-sent names overwrite it (in-game renames propagate automatically).
            helperText={t('accountManageRenameHelper')}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            // Manage mode applies live on blur/Enter; create mode stages until confirm.
            {...(managedAccount ? {
              onBlur: () => renameAccount(managedAccount.id, nameDraft),
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') renameAccount(managedAccount.id, nameDraft) },
            } : {})}
          />
          {/* Player ID binding — editable so accounts can be (re)bound by hand,
              e.g. before RSL Helper itself passes the id. Empty unbinds. */}
          <TextField
            fullWidth size="small" variant="outlined" sx={{ mt: 2 }}
            label={t('accountManageHelperIdLabel')}
            helperText={t('accountManageHelperIdHelper')}
            value={playerIdDraft}
            onChange={(e) => setPlayerIdDraft(e.target.value)}
            {...(managedAccount ? {
              onBlur: applyPlayerIdDraft,
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') applyPlayerIdDraft() },
            } : {})}
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
                  if (managedAccount) setSellfileAutoPushForAccount(managedAccount.id, e.target.checked)
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
                checked={isCreate ? unstampedDraft : managedAccount?.unstampedDefault === true}
                onChange={(e) => {
                  if (isCreate) setUnstampedDraft(e.target.checked)
                  else if (managedAccount) setUnstampedDefaultAccount(e.target.checked ? managedAccount.id : null)
                }}
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
                onClick={() => {
                  if (isCreate) setAccentDraft(color)
                  else if (managedAccount) setAccountAccent(managedAccount.id, color)
                }}
                sx={{
                  width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', bgcolor: color,
                  // Selected swatch gets a visible ring; others a hairline.
                  border: '2px solid',
                  borderColor: dialogAccent === color ? 'text.primary' : 'divider',
                }}
              />
            ))}
          </Box>
          {managedAccount && (
            <>
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
            </>
          )}
        </DialogContent>
        <DialogActions>
          {isCreate ? (
            <>
              <Button onClick={() => setAccountDialog(null)}>{t('cancel')}</Button>
              <Button variant="contained" disabled={!nameDraft.trim()} onClick={handleCreate}>
                {t('accountCreateConfirm')}
              </Button>
            </>
          ) : (
            <Button onClick={() => setAccountDialog(null)}>{t('close')}</Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  )
}
