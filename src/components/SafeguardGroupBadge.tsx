/**
 * SafeguardGroupBadge
 *
 * The compact "group keeps ≥ N" marker a group member shows beside its own count — on the chip
 * in the list and wherever else a member's group promise is summarised. One component so the
 * glyph, the number and the tooltip wording are defined once; the caller passes the group's
 * colour already adapted to the surface it renders on.
 */
import { Box } from '@mui/material'
import GroupWorkOutlinedIcon from '@mui/icons-material/GroupWorkOutlined'
import { NBSP } from '../lib/constants'
import type { SafeguardGroupSettings } from '../lib/safeguards'
import { KEEP_OVERRIDE_SCOPE_KEYS } from '../lib/keepOverrideScope'
import MarkdownTooltip from './MarkdownTooltip'

type Translate = (key: string, params?: Record<string, string | number>) => string

// One i18n key per scope chip, in the shared display order, so the tooltip lists the group's
// buckets with the same words the builder's chips use.
const SCOPE_LABEL_KEYS: Record<(typeof KEEP_OVERRIDE_SCOPE_KEYS)[number], string> = {
  perSlot: 'safeguardsCountModePerSlot',
  perSet: 'safeguardsCountModePerSet',
  perFaction: 'safeguardsCountModePerFaction',
  perMainStat: 'safeguardsCountModePerMain',
}

/**
 * The human-readable "per slot · per set" list of a group's active chips, or the per-safeguard
 * word when none is on. Shared by the badge tooltip and the builder strip caption.
 */
export const describeSafeguardGroupScope = (settings: SafeguardGroupSettings, t: Translate): string => {
  const active = KEEP_OVERRIDE_SCOPE_KEYS
    .filter((scope) => settings.countMode[scope])
    .map((scope) => t(SCOPE_LABEL_KEYS[scope]))
  return active.length > 0 ? active.join(' · ') : t('safeguardsCountModePerRule')
}

export function SafeguardGroupBadge({ settings, color, t }: {
  settings: SafeguardGroupSettings
  /** The group's colour, already contrast-adapted to the badge's surface. */
  color: string
  t: Translate
}) {
  return (
    <MarkdownTooltip markdown={t('safeguardsGroupBadgeTooltip', { count: settings.requiredCount, scope: describeSafeguardGroupScope(settings, t) })}>
      <Box
        component="span"
        data-safeguard-group-badge={settings.id}
        sx={{ color, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', ml: 0.5 }}
      >
        <GroupWorkOutlinedIcon sx={{ fontSize: '0.9em', mr: 0.25 }} />
        ≥{NBSP}{settings.requiredCount}
      </Box>
    </MarkdownTooltip>
  )
}
