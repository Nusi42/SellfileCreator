/**
 * AccountSwitcher
 *
 * Header control for the multi-account feature (lib/accounts.ts is the registry SSOT).
 * One shared component, two mount points (app header + simple-mode Note dialog) so both
 * entry points stay in sync per the parallel-entry-points rule.
 *
 * Click the button → account menu. Clicking an account switches (writes the registry,
 * then reloads — one document per session, see lib/accounts.ts). Each row shows the
 * account's summary (saved-at, last successful push, recipe/safeguard/rule counts, and
 * the shared gear outcome chip) and carries a gear icon opening the account dialog for
 * THAT account. "New account…" opens the SAME dialog in create mode (staged fields,
 * "Create & switch"), so both flows share one look and feel. The button itself is FILLED
 * with the active account's accent (label contrast-adapted); "no accent" is a valid
 * choice. Rows mark the active account with a leading arrow and show the accent as a
 * trailing person glyph, followed by a toggleable auto-push button and the manage gear.
 */
import React, { useMemo, useState } from 'react'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Divider, FormControlLabel, IconButton, ListItemIcon, Menu, MenuItem,
  Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import PersonIcon from '@mui/icons-material/Person'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import SendIcon from '@mui/icons-material/Send'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import MarkdownTooltip from './MarkdownTooltip'
import { useI18n } from '../lib/i18n'
import { useAccounts } from '../state/useAccounts'
import {
  ACCOUNT_ACCENT_PALETTE,
  accountDisplayLabel,
  bindHelperAccount,
  createAccount,
  deleteAccount,
  pickDefaultAccent,
  renameAccount,
  setAccountAccent,
  setAccountNameEllipsis,
  setUnstampedDefaultAccount,
  stageAccountMergeCarry,
  switchAccount,
  type SfcAccount,
} from '../lib/accounts'
import { readAccountListSummary } from '../lib/accountSummaries'
import { formatLocalDateTime } from '../lib/dateDisplay'
import { useTheme, useColorScheme } from '@mui/material/styles'
import { resolveSchemePalette, schemeModeFromColorScheme } from '../lib/themeCustomTokens'
import { blendAlpha, ensureContrastOnBg, WCAG_NORMAL_TEXT_CONTRAST } from '../lib/colorUtils'
import { ALPHA } from '../lib/colorTints'
import GearInspectorOutcomeSummaryChip from './GearInspectorOutcomeSummaryChip'
import { AUTO_PUSH_BLINK_MS, autoPushBlink } from '../lib/pushFeedbackKeyframes'
import {
  getSellfileAutoPushForAccount,
  setSellfileAutoPushForAccount,
} from '../state/exportPreferences'
import { getPersistEndpointGearForAccount, setPersistEndpointGearForAccount, getRestoreCustomGearForAccount, setRestoreCustomGearForAccount } from '../state/gearDbPreferences'

export type AccountSwitcherProps = {
  // Serializes the current document with the regular .sfc writer; staged as the merge carry
  // when the user shift-picks a target account (offered through the shift-import dialog there).
  getMergeSfcText: () => string
  // Compact variant for the simple-mode Note dialog action strip: natural small-button
  // height so it matches the strip's other outlined controls (header variant is 34px).
  compact?: boolean
  // Increments on every background push attempt (any account) — replays the same pulse
  // the simple-mode send button plays, as the toast-free background-activity signal.
  flashSeq?: number
}

// The account dialog serves both flows: 'create' stages values until confirmation,
// 'manage' edits the identified account live (registry updates re-render instantly).
type AccountDialogState = { mode: 'create' } | { mode: 'manage'; accountId: string } | null

// Trailing accent marker at each row's edge: the same person glyph the switcher button
// uses, filled with the account's accent so the colour reads at a glance (a tiny square
// swatch was too small to register). The raw user colour is fine as a *background* here —
// it never renders as text, so no contrast adaptation is needed (same as other swatches).
// Accounts without an accent render an outlined person on the default surface so the
// trailing manage icons stay column-aligned across rows. glyphColor is the scheme text
// pushed to contrast ON the accent fill (computed by the caller with the same colour-SSOT
// primitive the switcher button label uses); it is ignored when there is no accent.
function AccentPerson({ color, glyphColor, size = 26 }: { color: string | undefined; glyphColor: string | undefined; size?: number }) {
  return (
    <Box
      component="span"
      sx={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        // Hairline outline keeps the marker visible whether or not it carries an accent.
        border: '1px solid', borderColor: 'divider',
        ...(color ? { bgcolor: color } : {}),
      }}
    >
      <PersonIcon
        sx={{
          // Glyph reads as the accent's contrast colour when filled, muted when absent.
          fontSize: size * 0.62,
          color: color ? glyphColor : 'text.disabled',
        }}
      />
    </Box>
  )
}

export default function AccountSwitcher({ getMergeSfcText, compact = false, flashSeq = 0 }: AccountSwitcherProps) {
  const { t } = useI18n()
  const { accounts, activeAccount } = useAccounts()
  // The accent FILLS the switcher button, so the label is the active scheme's text
  // colour pushed to sufficient contrast ON that fill (shared LCH contrast primitive —
  // the colour-SSOT rule for theme text rendered on a user colour). resolveSchemePalette
  // reads the RUNTIME scheme (theme.palette is frozen to light under cssVariables).
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  const schemePalette = resolveSchemePalette(theme, schemeModeFromColorScheme(colorScheme))
  const accent = activeAccount.accentColor
  // One definition of "scheme text pushed to contrast ON this accent fill" (colour-SSOT):
  // the switcher button label and the per-row accent-person glyph both read through it.
  // 4.5:1 (normal-text AA) — the default 3.0 UI-component target reads too faint for a
  // small mark on an arbitrary accent fill. undefined accent → undefined (no fill to adapt).
  const accentGlyphColor = (fill: string | undefined): string | undefined =>
    fill ? ensureContrastOnBg(schemePalette.text.primary, fill, WCAG_NORMAL_TEXT_CONTRAST) : undefined
  const accentLabel = accentGlyphColor(accent)
  // Hover feedback mirrors MUI's action model: scheme text blended over the fill at a low step.
  const accentHoverBg = accent ? blendAlpha(accent, schemePalette.text.primary, ALPHA.a10) : undefined

  // Menu anchor kept in state (not a ref) so the Menu gets a stable render-time value.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const menuOpen = menuAnchor !== null
  const closeMenu = () => setMenuAnchor(null)
  // Bumped whenever a row toggles auto-push in place, so the per-account summary memo
  // (which reads the raw scoped auto-push key) recomputes and the glyph reflects the flip.
  const [summaryNonce, setSummaryNonce] = useState(0)

  // Per-account saved-at/counts, computed lazily on each menu open (the SFC summary
  // needs a full document parse per account — cheap enough at menu-open frequency).
  const accountSummaries = useMemo(() => {
    // Referencing summaryNonce keeps it a genuine dependency (both hook linters agree):
    // an in-place auto-push toggle bumps it so the summaries — which read the raw scoped
    // auto-push key imperatively — recompute and the row glyph reflects the flip. The void
    // is intentional; the value itself does not shape the map, only that it changed.
    void summaryNonce
    if (!menuOpen) return new Map<string, ReturnType<typeof readAccountListSummary>>()
    return new Map(accounts.map((account) => [account.id, readAccountListSummary(account.id)]))
  }, [menuOpen, accounts, summaryNonce])

  // Account label with the shared name → Player ID resolution; localized fallback when
  // an account has neither (names are optional).
  const accountLabel = (account: SfcAccount): string => accountDisplayLabel(account) || t('accountUnnamed')

  // Preset-menu-style caption block, one fact per line for scanability: "Saved <date>",
  // "Pushed <date>", "N recipes · M safeguards · K rules". Saved (local autosave) and
  // pushed (what RSL Helper has) are DIFFERENT facts — the push line is always present so
  // the saved line can never be misread as push state. Auto-push state is NOT a caption
  // line: it lives in its own toggleable trailing column (read from the SSOT scoped key).
  // The gear outcome chip (total / sold / kept / safeguarded) renders separately below.
  const summaryRow = (accountId: string): { savedLine: string | null; pushedLine: string; countsLine: string | null } | null => {
    const summary = accountSummaries.get(accountId)
    if (!summary) return null
    // formatLocalDateTime returns null on unparsable input — gate before interpolating.
    const savedDate = summary.savedAt ? formatLocalDateTime(summary.savedAt) : null
    const pushedDate = summary.lastPushAt ? formatLocalDateTime(summary.lastPushAt) : null
    const countParts = [
      summary.recipeCount !== null ? t('accountSummaryRecipes', { count: summary.recipeCount }) : null,
      summary.safeguardCount !== null ? t('accountSummarySafeguards', { count: summary.safeguardCount }) : null,
      summary.rulesCount !== null ? t('accountSummaryRules', { count: summary.rulesCount }) : null,
    ].filter((part): part is string => Boolean(part))
    return {
      savedLine: savedDate ? t('accountSummarySavedAt', { date: savedDate }) : null,
      pushedLine: pushedDate ? t('accountSummaryPushedAt', { date: pushedDate }) : t('accountSummaryNeverPushed'),
      countsLine: countParts.length > 0 ? countParts.join(' · ') : null,
    }
  }

  // The unified account dialog (create or manage) + its staged/managed field drafts.
  const [accountDialog, setAccountDialog] = useState<AccountDialogState>(null)
  const managedAccount = accountDialog?.mode === 'manage'
    ? accounts.find((a) => a.id === accountDialog.accountId) ?? null
    : null
  const [nameDraft, setNameDraft] = useState('')
  const [playerIdDraft, setPlayerIdDraft] = useState('')
  // Auto-push is a raw scoped key (not registry state) — mirrored in local state.
  const [autoPushDraft, setAutoPushDraft] = useState(false)
  // Endpoint-gear persistence is a raw scoped key too — mirrored the same way.
  const [persistGearDraft, setPersistGearDraft] = useState(true)
  // Restore-custom-gear is a raw scoped key too (default ON) — mirrored the same way.
  const [restoreCustomGearDraft, setRestoreCustomGearDraft] = useState(true)
  // Create-mode-only staged values (manage mode applies these live instead).
  // undefined = "no accent colour" — the button then keeps the default theme colour.
  const [accentDraft, setAccentDraft] = useState<string | undefined>(ACCOUNT_ACCENT_PALETTE[0]!)
  const [unstampedDraft, setUnstampedDraft] = useState(false)
  const [nameEllipsisDraft, setNameEllipsisDraft] = useState<'left' | 'right'>('left')
  // Delete confirmation is its own dialog, rendered over the manage dialog.
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  // Identity (name + Player ID) at manage-dialog open: the both-empty guard reverts to it.
  const manageOpenSnapshotRef = React.useRef<{ name: string; playerId: string }>({ name: '', playerId: '' })

  // Full reload after any active-account change: one document per session (see lib/accounts.ts).
  const reload = () => { window.location.reload() }

  // Seed drafts for the picked account and open the dialog in manage mode.
  const openManage = (account: SfcAccount) => {
    closeMenu()
    setNameDraft(account.displayName)
    setPlayerIdDraft(account.helperAccountId ?? '')
    setAutoPushDraft(getSellfileAutoPushForAccount(account.id))
    setPersistGearDraft(getPersistEndpointGearForAccount(account.id))
    setRestoreCustomGearDraft(getRestoreCustomGearForAccount(account.id))
    setDeleteConfirmOpen(false)
    // Identity snapshot for the both-empty guard (see revertIdentityToOpenSnapshot).
    manageOpenSnapshotRef.current = { name: account.displayName, playerId: account.helperAccountId ?? '' }
    setAccountDialog({ mode: 'manage', accountId: account.id })
  }

  // Blank drafts (accent pre-picked like createAccount would) and open in create mode.
  const openCreate = () => {
    closeMenu()
    setNameDraft('')
    setPlayerIdDraft('')
    setAutoPushDraft(false)
    setPersistGearDraft(true)
    setAccentDraft(pickDefaultAccent(accounts.length))
    setUnstampedDraft(false)
    setNameEllipsisDraft('left')
    setAccountDialog({ mode: 'create' })
  }

  // Plain click switches (write the registry, then reload). Shift+click additionally stages
  // the current document as a one-shot carry, so the target account opens the shift-import
  // merge dialog on boot (same dialog as shift-loading an .sfc) — no extra confirmation step.
  const handlePickAccount = (event: React.MouseEvent, account: SfcAccount) => {
    if (account.id === activeAccount.id) { closeMenu(); return }
    if (event.shiftKey) {
      try {
        stageAccountMergeCarry({ fromDisplayName: accountLabel(activeAccount), sfcText: getMergeSfcText() })
      } catch {
        // Serialization failure: fall back to a plain switch rather than blocking it.
      }
    }
    switchAccount(account.id)
    reload()
  }

  // Create mode confirmation: apply every staged field, then switch into the account.
  const handleCreate = () => {
    const account = createAccount(nameDraft)
    const trimmedId = playerIdDraft.trim()
    if (trimmedId) bindHelperAccount(account.id, trimmedId)
    // createAccount auto-assigns a palette accent; undefined here clears it ("no accent").
    setAccountAccent(account.id, accentDraft)
    if (autoPushDraft) setSellfileAutoPushForAccount(account.id, true)
    if (!persistGearDraft) setPersistEndpointGearForAccount(account.id, false)
    if (!restoreCustomGearDraft) setRestoreCustomGearForAccount(account.id, false)
    if (unstampedDraft) setUnstampedDefaultAccount(account.id)
    setAccountNameEllipsis(account.id, nameEllipsisDraft)
    setAccountDialog(null)
    // Creating implies "start working on it" — switch straight into the new account.
    switchAccount(account.id)
    reload()
  }

  // Manage-mode identity guard: an account must keep SOME identity (name or Player ID).
  // An apply that would empty BOTH reverts the fields to their dialog-open values —
  // the same invariant the create dialog enforces via its disabled confirm button.
  const revertIdentityToOpenSnapshot = () => {
    if (!managedAccount) return
    const snap = manageOpenSnapshotRef.current
    setNameDraft(snap.name)
    setPlayerIdDraft(snap.playerId)
    renameAccount(managedAccount.id, snap.name)
    bindHelperAccount(managedAccount.id, snap.playerId || undefined)
  }

  // Manage mode: the name field applies on blur/Enter; '' is allowed while a Player ID
  // remains as the identity, otherwise the both-empty guard reverts.
  const applyNameDraft = () => {
    if (!managedAccount) return
    if (nameDraft.trim() === '' && !(managedAccount.helperAccountId ?? '')) {
      revertIdentityToOpenSnapshot()
      return
    }
    renameAccount(managedAccount.id, nameDraft)
  }

  // Manage mode: the Player ID field applies on blur/Enter; empty unbinds — unless the
  // account has no name either (both-empty guard reverts).
  const applyPlayerIdDraft = () => {
    if (!managedAccount) return
    const trimmed = playerIdDraft.trim()
    if (trimmed === '' && managedAccount.displayName === '') {
      revertIdentityToOpenSnapshot()
      return
    }
    if ((managedAccount.helperAccountId ?? '') === trimmed) return
    bindHelperAccount(managedAccount.id, trimmed || undefined)
  }

  const handleDelete = () => {
    if (!managedAccount) return
    // deleteAccount reports whether the ACTIVE account changed → then a reload is due.
    const needsReload = deleteAccount(managedAccount.id)
    setDeleteConfirmOpen(false)
    setAccountDialog(null)
    if (needsReload) reload()
  }

  // Bold state line + interaction help, mirroring the connect button's tooltip format.
  const tooltipMd = `**${t('accountSwitcherTooltip', { name: accountLabel(activeAccount) })}**\n\n${t('accountMenuShiftHint')}`
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
          // key change on each background push remounts the button so the pulse replays
          // (same pattern as the simple-mode send button).
          key={flashSeq}
          size="small"
          variant="outlined"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          aria-label={t('accountSwitcherAriaLabel')}
          // Header variant matches the 34px control row; the compact variant (simple-mode
          // action strip) keeps the natural small-button height so it lines up with its
          // outlined neighbours (Reset / Connect / Go Expert) instead of reading shorter.
          // The accent FILLS the whole button (hover must restate the fill — the variant's
          // own hover background would wipe it); no accent → default theme button colour.
          sx={{
            ...(compact ? {} : { height: 34 }), whiteSpace: 'nowrap', textTransform: 'none', maxWidth: 240,
            // Icon + name sit in a row with a small gap; the name box does the ellipsizing.
            display: 'inline-flex', alignItems: 'center', gap: 0.5,
            ...(accent ? {
              bgcolor: accent,
              color: accentLabel,
              borderColor: accent,
              '&:hover': { bgcolor: accentHoverBg, borderColor: accent },
            } : {}),
            // Background push happened (any account, success or failure) → one pulse.
            ...(flashSeq > 0 ? { animation: `${autoPushBlink} ${AUTO_PUSH_BLINK_MS}ms ease-out` } : {}),
          }}
        >
          {/* Common person glyph left of the account name/player ID. Inherits the label colour
              (accent-contrast or theme) via currentColor and never shrinks or truncates. */}
          <PersonIcon sx={{ fontSize: '1.1rem', flexShrink: 0 }} />
          {/* Ellipsize long names so the header row never overflows. The account chooses
              WHICH side truncates (manager setting): 'left' (default) keeps the END of
              the name visible — direction:rtl flips the box's overflow edge so the
              ellipsis lands on the left, and LRM marks (U+200E) pin the characters to
              their natural LTR order so edge punctuation cannot visually jump. */}
          <Box
            component="span"
            sx={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
              ...(activeAccount.nameEllipsis === 'right'
                ? {}
                : { direction: 'rtl', textAlign: 'left' }),
            }}
          >
            {activeAccount.nameEllipsis === 'right'
              ? accountLabel(activeAccount)
              : `\u200E${accountLabel(activeAccount)}\u200E`}
          </Box>
        </Button>
      </MarkdownTooltip>

      <Menu anchorEl={menuAnchor} open={menuOpen} onClose={closeMenu}>
        {accounts.map((account) => {
          const summary = accountSummaries.get(account.id)
          const row = summaryRow(account.id)
          // Auto-push state read straight from the SSOT scoped key (same source the summary
          // uses) so the toggle is correct even before the per-account summary is computed.
          const autoPushOn = getSellfileAutoPushForAccount(account.id)
          // Failed background push → dated error line (toast-free background feedback).
          const errorDate = summary?.lastPushErrorAt ? formatLocalDateTime(summary.lastPushErrorAt) : null
          return (
            <MenuItem
              key={account.id}
              selected={account.id === activeAccount.id}
              onClick={(e) => handlePickAccount(e, account)}
            >
              {/* Leading slot marks the ACTIVE account with a right arrow ("you are here"). */}
              <ListItemIcon>
                {account.id === activeAccount.id ? <ArrowForwardIcon fontSize="small" /> : null}
              </ListItemIcon>
              {/* Preset-menu row layout: name + caption lines (Player ID, summary) + gear chip. */}
              <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography variant="body2" noWrap>{accountLabel(account)}</Typography>
                {account.helperAccountId ? (
                  <Typography variant="caption" noWrap sx={captionSx}>
                    {t('accountBoundCaption', { id: account.helperAccountId })}
                  </Typography>
                ) : null}
                {row?.savedLine ? (
                  <Typography variant="caption" noWrap sx={captionSx}>{row.savedLine}</Typography>
                ) : null}
                {row ? (
                  <Typography variant="caption" noWrap sx={captionSx}>{row.pushedLine}</Typography>
                ) : null}
                {row?.countsLine ? (
                  <Typography variant="caption" noWrap sx={captionSx}>{row.countsLine}</Typography>
                ) : null}
                {errorDate ? (
                  <Typography
                    variant="caption"
                    noWrap
                    // Full-strength error colour (not the dimmed caption opacity) — this is
                    // the only surface where a failed background push is reported.
                    sx={{ lineHeight: 1.3, color: 'error.main', display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <ErrorOutlineIcon sx={{ fontSize: 14 }} />
                    {t('accountSummaryPushFailed', { date: errorDate })}
                  </Typography>
                ) : null}
                {/* The SAME outcome chip used in the preview headers — last known
                    total/sold/kept/safeguarded from the account's stats snapshot. */}
                {summary?.gearOutcome ? (
                  <Box sx={{ mt: 0.5, alignSelf: 'flex-start' }}>
                    <GearInspectorOutcomeSummaryChip summary={summary.gearOutcome} />
                  </Box>
                ) : null}
              </Box>
              {/* Trailing accent marker: the account's person glyph filled with its accent,
                  large enough to read at a glance (glyph contrast-adapted ON the fill). */}
              <AccentPerson color={account.accentColor} glyphColor={accentGlyphColor(account.accentColor)} />
              {/* Auto-push contract as a toggleable column, mirroring the manage gear:
                  green send = on, dim = off. Clicking flips the raw scoped key in place
                  (no switch, no dialog) and bumps the summary nonce so the glyph updates.
                  Tooltip + aria carry the localized state for pointer and screen readers. */}
              <Tooltip title={t(autoPushOn ? 'accountSummaryAutoPushOn' : 'accountSummaryAutoPushOff')}>
                <IconButton
                  size="small"
                  aria-label={t(autoPushOn ? 'accountSummaryAutoPushOn' : 'accountSummaryAutoPushOff')}
                  sx={{ ml: 1 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSellfileAutoPushForAccount(account.id, !autoPushOn)
                    setSummaryNonce((n) => n + 1)
                  }}
                >
                  <SendIcon fontSize="small" sx={{ color: autoPushOn ? 'success.main' : 'text.disabled' }} />
                </IconButton>
              </Tooltip>
              {/* Manage THIS account without switching to it (name, id, auto-push, …). */}
              <Tooltip title={t('accountMenuManage')}>
                <IconButton
                  size="small"
                  aria-label={t('accountMenuManage')}
                  sx={{ ml: 1 }}
                  onClick={(e) => { e.stopPropagation(); openManage(account) }}
                >
                  <SettingsOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </MenuItem>
          )
        })}
        <Divider />
        <MenuItem onClick={openCreate}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          {t('accountMenuNew')}
        </MenuItem>
        {/* Advertise the shift-merge affordance where the user is already looking —
            text.disabled matches the app's other purely-informative labels (filter header).
            The colour must live in sx: the Typography color PROP does not resolve the
            token here and the text inherits the menu's full-strength foreground. */}
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', px: 2, pt: 0.5, maxWidth: 260 }}>
          {t('accountMenuShiftHint')}
        </Typography>
      </Menu>

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
              onBlur: applyNameDraft,
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') applyNameDraft() },
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
            {/* Leading "none" swatch — a struck-through circle clears the accent. */}
            <Box
              aria-label={t('accountManageAccentNone')}
              title={t('accountManageAccentNone')}
              onClick={() => {
                if (isCreate) setAccentDraft(undefined)
                else if (managedAccount) setAccountAccent(managedAccount.id, undefined)
              }}
              sx={{
                width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                position: 'relative', overflow: 'hidden',
                border: '2px solid',
                borderColor: dialogAccent === undefined ? 'text.primary' : 'divider',
                // Diagonal strike marks "no colour" (theme token, not a user colour).
                '&::after': {
                  content: '""', position: 'absolute', left: '50%', top: -3, bottom: -3,
                  width: '2px', ml: '-1px', bgcolor: 'text.disabled', transform: 'rotate(45deg)',
                },
              }}
            />
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
          {/* Which side long names truncate on in the switcher button. Default 'left'
              keeps the END of the name visible (game names often differ at the tail).
              Create stages the choice; manage applies it live. */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            {t('accountManageNameEllipsisLabel')}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            sx={{ mt: 0.5 }}
            value={isCreate ? nameEllipsisDraft : (managedAccount?.nameEllipsis === 'right' ? 'right' : 'left')}
            onChange={(_e, side: 'left' | 'right' | null) => {
              if (!side) return
              if (isCreate) setNameEllipsisDraft(side)
              else if (managedAccount) setAccountNameEllipsis(managedAccount.id, side)
            }}
          >
            <ToggleButton value="left">{t('accountManageNameEllipsisStart')}</ToggleButton>
            <ToggleButton value="right">{t('accountManageNameEllipsisEnd')}</ToggleButton>
          </ToggleButtonGroup>
          <Divider sx={{ my: 2 }} />
          {/* Per-account: keep THIS account's real endpoint gear out of localStorage. */}
          <FormControlLabel
            sx={{ display: 'flex' }}
            control={(
              <Switch
                size="small"
                checked={persistGearDraft}
                onChange={(e) => {
                  setPersistGearDraft(e.target.checked)
                  if (managedAccount) setPersistEndpointGearForAccount(managedAccount.id, e.target.checked)
                }}
              />
            )}
            label={t('accountManagePersistGear')}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
            {t('accountManagePersistGearHint')}
          </Typography>
          {/* Per-account: reload THIS account's custom (manual) gear at startup (default ON). */}
          <FormControlLabel
            sx={{ display: 'flex', mt: 1 }}
            control={(
              <Switch
                size="small"
                checked={restoreCustomGearDraft}
                onChange={(e) => {
                  setRestoreCustomGearDraft(e.target.checked)
                  if (managedAccount) setRestoreCustomGearForAccount(managedAccount.id, e.target.checked)
                }}
              />
            )}
            label={t('accountManageRestoreCustomGear')}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
            {t('accountManageRestoreCustomGearHint')}
          </Typography>
          {managedAccount && (
            <>
              <Divider sx={{ my: 2 }} />
              {/* Deleting the last account is refused by deleteAccount; disable the entry point too. */}
              <Button color="error" size="small" disabled={accounts.length <= 1}
                onClick={() => setDeleteConfirmOpen(true)}>
                {t('accountManageDelete')}
              </Button>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {isCreate ? (
            <>
              <Button onClick={() => setAccountDialog(null)}>{t('cancel')}</Button>
              {/* A name is optional, but the account needs SOME identity: name or Player ID. */}
              <Button variant="contained" disabled={!nameDraft.trim() && !playerIdDraft.trim()} onClick={handleCreate}>
                {t('accountCreateConfirm')}
              </Button>
            </>
          ) : (
            <Button onClick={() => setAccountDialog(null)}>{t('close')}</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Delete confirmation — a regular dialog over the manage dialog (destructive action). */}
      <Dialog open={deleteConfirmOpen && managedAccount !== null} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>{t('accountDeleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('accountManageDeleteConfirm', { name: managedAccount ? accountLabel(managedAccount) : '' })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>{t('cancel')}</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            {t('accountManageDeleteConfirmButton')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
