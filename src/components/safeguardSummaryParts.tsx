/**
 * safeguardSummaryParts
 *
 * SSOT rich-JSX summary renderer for a SafeguardRule chip. Mirrors the visual
 * style of summaryParts() in RecipeChip: slot icons, faction icons, colored
 * main/substats, set icons, pipe-separated sections.
 *
 * Kept in its own module so it can be imported by SafeguardChipsPanel and any
 * future surface (e.g. read-only previews) without pulling in full chip state.
 */
import type React from 'react'
import { Box } from '@mui/material'
import type { JSX } from 'react'
import {
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  labelOfVariant,
  statVariantI18nKey,
  artifactTypeName,
  artifactTypeI18nKey,
  compareArtifactTypes,
  compareVariants,
  artifactSetName,
  getLocalizedGearSetName,
  factionCodeToName,
  factionI18nKey,
  rarityCodeToName,
  rarityCodeFromRankValue,
  rarityRankValueI18nKey,
  type RankValue,
} from '../lib/types'
import {
  NBSP,
} from '../lib/constants'

const METASET_ICON_BOX_PX = 16
import { type SafeguardRule, SafeguardSubstatMatch } from '../lib/safeguards'
import MarkdownTooltip from './MarkdownTooltip'
import { slotSelectionAllowsAccessories } from '../lib/gearInspectorDomain'
import type { Metaset } from '../lib/metasets'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { FactionIcon } from './FactionIcon'
import { SetIcon } from './SetIcon'
import { DEFAULT_METASET_ICON_ID, metasetIconOptionById } from '../lib/metasetIcons'
import type { MetasetIconId } from '../lib/metasetIcons'
import { splitArtifactSetSelections } from '../lib/gearSets/selection'

// Baseline nudges mirror the RecipeChip constants exactly so icons sit at the
// same visual height as their recipe-chip counterparts.
const SLOT_ICON_OFFSET_EM = -0.20
const FACTION_ICON_OFFSET_EM = -0.45
const SET_ICON_OFFSET_EM = -0.35

const withNbsp = (value: string | undefined | null): string => {
  if (!value) return ''
  return value.replace(/ /g, NBSP)
}

export type SafeguardSummaryOpts = {
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  showFactionIcons: boolean
  showSetIcons: boolean
  showSlotIcons: boolean
  t?: (key: string, params?: Record<string, string | number>) => string
  lang: string
  // When true, suppresses hover tooltips (e.g. substat weight values).
  tooltipsDisabled?: boolean
}


/**
 * Builds a rich JSX summary for a SafeguardRule, matching the visual style of
 * RecipeChip's summaryParts: slot icons, colored stats, set icons, pipe separators.
 * Returns null when the rule has no displayable content.
 */
export function safeguardSummaryParts(
  rule: SafeguardRule,
  metasets: Metaset[],
  opts: SafeguardSummaryOpts,
): JSX.Element | null {
  const parts: Array<JSX.Element> = []
  const addText = (text: string) => { if (text) parts.push(<Box key={`t-${parts.length}`} component="span">{text}</Box>) }
  const addNode = (node: JSX.Element) => parts.push(<Box key={`n-${parts.length}`} component="span">{node}</Box>)

  const c = rule.combination
  // Faction scope is only meaningful when the rule can include accessory slots.
  // Mirrors SafeguardBuilderPanel's effectiveCountMode gate (same SSOT rule).
  const hasAccessorySlot = slotSelectionAllowsAccessories(c.slots)

  // ── Slots ─────────────────────────────────────────────────────────────────
  const perSlot = rule.countMode?.perSlot ?? false
  if (c.slots && c.slots.length > 0) {
    const sorted = [...c.slots].sort(compareArtifactTypes)
    // "Per Slot: " prefix when this rule splits its quota by slot.
    const slotLbl = perSlot ? `${opts.t ? opts.t('safeguardsCountModePerSlot') : 'Per Slot'}:${NBSP}` : ''
    if (opts.showSlotIcons) {
      const nodes = sorted.map((typeId) => {
        const Icon = artifactTypeIconFor(typeId)
        if (Icon) {
          return (
            <Box
              key={`slot-${typeId}`}
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                mr: 0.5,
                verticalAlign: `${SLOT_ICON_OFFSET_EM}em`,
              }}
            >
              <Icon fontSize="inherit" />
            </Box>
          )
        }
        // Icon missing: fall back to localised text label.
        const label = withNbsp(opts.t ? opts.t(artifactTypeI18nKey(typeId)) : artifactTypeName(typeId))
        return <Box key={`slot-${typeId}`} component="span" sx={{ mr: 0.5 }}>{label}</Box>
      })
      addNode(
        <>
          {slotLbl && <Box component="span">{slotLbl}</Box>}
          {nodes}
        </>,
      )
    } else {
      const labels = sorted.map((typeId) =>
        withNbsp(opts.t ? opts.t(artifactTypeI18nKey(typeId)) : artifactTypeName(typeId)),
      )
      addText(`${slotLbl}${labels.join(', ')}`)
    }
  } else if (perSlot) {
    // Wildcard slots (all slots): show the Per Slot scope label alone.
    addText(opts.t ? opts.t('safeguardsCountModePerSlot') : 'Per Slot')
  }

  // ── Ranks + Rarities ──────────────────────────────────────────────────────
  // Both rendered in one pipe segment, separated by NBSP, matching the
  // RecipeChip rank+rarity layout. Either half is omitted when not set.
  {
    const rankLabel = (n: number): string => {
      const star = (s: number): string => {
        const tr = opts.t
        if (!tr) return `${s}★`
        switch (s) {
          case 1: return tr('star1')
          case 2: return tr('star2')
          case 3: return tr('star3')
          case 4: return tr('star4')
          case 5: return tr('star5')
          case 6: return tr('star6')
          default: return `${s}★`
        }
      }
      if (n >= 1 && n <= 6) return star(n)
      if (n >= 7 && n <= 11) return `≥${NBSP}${star(n - 6)}`
      if (n >= 12 && n <= 16) return `≤${NBSP}${star(n - 10)}`
      return String(n)
    }
    const segmentParts: string[] = []
    if (c.ranks && c.ranks.length > 0) {
      segmentParts.push(c.ranks.map((r) => rankLabel(Number(r))).join('/'))
    }
    if (c.rarities && c.rarities.length > 0) {
      // Rarities are stored as rank values 1–6 (where 6 = Mythical). Using
      // rarityRankValueI18nKey avoids a collision: RarityCode.GTE_Common also = 6,
      // which caused Mythical to render as ">= Common" via the old switch.
      segmentParts.push(c.rarities.map((r) => {
        const v = Number(r) as RankValue
        if (opts.t) return opts.t(rarityRankValueI18nKey(v))
        return rarityCodeToName(rarityCodeFromRankValue(v)) || String(v)
      }).join('/'))
    }
    if (segmentParts.length > 0) {
      addText(segmentParts.join(NBSP))
    }
  }

  // ── Factions ──────────────────────────────────────────────────────────────
  // Suppress perFaction when no accessory slots are in scope, matching the
  // builder's effectiveCountMode behaviour so the chip summary stays coherent.
  const perFaction = hasAccessorySlot && (rule.countMode?.perFaction ?? false)
  if (c.factions && c.factions.length > 0) {
    // "Per Faction: " prefix when this rule splits its quota by faction.
    const factionLbl = perFaction ? `${opts.t ? opts.t('safeguardsCountModePerFaction') : 'Per Faction'}:${NBSP}` : ''
    const factNodes = c.factions.map((factionCode) => {
      const rawLabel = opts.t ? opts.t(factionI18nKey(factionCode)) : factionCodeToName(factionCode)
      const label = withNbsp(rawLabel)
      if (opts.showFactionIcons) {
        return (
          <Box
            key={`f-${factionCode}`}
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              verticalAlign: `${FACTION_ICON_OFFSET_EM}em`,
            }}
          >
            <FactionIcon faction={factionCode} size={18} sx={{ mr: 0.25 }} />
          </Box>
        )
      }
      return <Box key={`f-${factionCode}`} component="span">{label}</Box>
    })
    addNode(
      <>
        {factionLbl && <Box component="span">{factionLbl}</Box>}
        {factNodes}
      </>,
    )
  } else if (perFaction) {
    // Wildcard factions (all factions): show the Per Faction scope label alone.
    addText(opts.t ? opts.t('safeguardsCountModePerFaction') : 'Per Faction')
  }

  // ── Main stats ────────────────────────────────────────────────────────────
  const perMainStat = rule.countMode?.perMainStat ?? false
  if (c.mainStats && c.mainStats.length > 0) {
    // "Per Mainstat: " prefix when this rule splits its quota by main stat.
    const mainLbl = perMainStat ? `${opts.t ? opts.t('safeguardsCountModePerMain') : 'Per Mainstat'}:${NBSP}` : ''
    const sorted = [...c.mainStats].sort(compareVariants)
    const nodes = sorted.map((vk) => {
      const name = withNbsp(opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
      const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
      return (
        <Box key={`m-${vk}`} component="span" sx={{ color: opts.useStatButtonColors ? fg : undefined }}>
          {name}
        </Box>
      )
    })
    const interleaved: JSX.Element[] = []
    nodes.forEach((n, i) => {
      interleaved.push(n)
      if (i < nodes.length - 1) interleaved.push(<Box key={`m-sep-${sorted[i]}`} component="span">, </Box>)
    })
    addNode(
      <>
        {mainLbl && <Box component="span">{mainLbl}</Box>}
        {interleaved}
      </>,
    )
  } else if (perMainStat) {
    // Wildcard main stats (all main stats): show the Per Mainstat scope label alone.
    addText(opts.t ? opts.t('safeguardsCountModePerMain') : 'Per Mainstat')
  }

  // ── Substats ──────────────────────────────────────────────────────────────
  // Safeguard substats carry a substatMatch threshold and optional per-stat
  // weights. The section label reflects the threshold ("Subs ≥N:", "Subs each:").
  // Custom weights surface as dotted underlines + hover tooltips, matching the
  // RecipeChip roll-target underline pattern so the visual language stays consistent.
  if (rule.substats && rule.substats.length > 0) {
    const sorted = [...rule.substats].sort(compareVariants)
    const weights = rule.substatWeights ?? {}
    const nodes = sorted.map((vk) => {
      const name = withNbsp(opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
      const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
      const weight = weights[vk]
      // Show dotted underline when a non-default (≠1) weight is explicitly set.
      const hasCustomWeight = weight !== undefined && weight !== 1
      const content = (
        <Box
          key={`s-${vk}`}
          component="span"
          sx={{
            color: opts.useStatButtonColors ? fg : undefined,
            textDecoration: hasCustomWeight ? 'underline' : undefined,
            textDecorationStyle: hasCustomWeight ? 'dotted' : undefined,
            textDecorationThickness: hasCustomWeight ? '1px' : undefined,
            textUnderlineOffset: hasCustomWeight ? 2 : undefined,
          }}
        >
          {name}
        </Box>
      )
      if (hasCustomWeight && !opts.tooltipsDisabled) {
        // Tooltip shows the exact multiplier value on hover.
        const tooltipText = opts.t
          ? opts.t('safeguardSubstatWeight', { value: weight })
          : `Weight: ${weight}×`
        return (
          <MarkdownTooltip key={`s-${vk}`} markdown={tooltipText} arrow>
            {content}
          </MarkdownTooltip>
        )
      }
      return content
    })
    const interleaved: JSX.Element[] = []
    nodes.forEach((n, i) => {
      interleaved.push(n)
      if (i < nodes.length - 1) interleaved.push(<Box key={`s-sep-${sorted[i]}`} component="span">, </Box>)
    })
    const tr = opts.t
    // Label reflects the substat match threshold: plain "Subs:" for Min1 (default),
    // "Subs ≥N:" for Min2–Min4, "Subs each:" for PerSubstat independent scoring.
    const subsLabel = (() => {
      const match = rule.substatMatch ?? SafeguardSubstatMatch.Min1
      if (match === SafeguardSubstatMatch.PerSubstat) {
        return tr ? tr('chipSubsEach') : 'Subs each'
      }
      const n = parseInt(match, 10)
      if (n >= 2 && n <= 4) {
        return tr ? tr('chipSubsMin', { n }) : `Subs ≥${n}`
      }
      // Min1: default threshold, no annotation needed.
      return tr ? tr('chipSubs') : 'Subs'
    })()
    addNode(
      <>
        <Box component="span">{`${subsLabel}:${NBSP}`}</Box>
        {interleaved}
      </>,
    )
  }

  // ── Improvement-chance threshold ─────────────────────────────────────────
  // Only shown when the threshold is active; rendered as "Improvement chance ≥ N%".
  if (rule.improvementChanceThreshold !== null && rule.improvementChanceThreshold !== undefined) {
    const pct = rule.improvementChanceThreshold
    addText(opts.t
      ? opts.t('safeguardsImprovementChanceWithValue', { value: pct })
      : `Improvement chance ≥ ${pct}%`)
  }

  // ── Sets + Metasets ───────────────────────────────────────────────────────
  const perSet = rule.countMode?.perSet ?? false
  {
    const setSelection = splitArtifactSetSelections(c.sets)
    const setIdsSorted = setSelection.included.slice().sort((a, b) => Number(a) - Number(b))
    const excludedSetIds = setSelection.excluded.slice().sort((a, b) => Number(a) - Number(b))
    const metaEntries = (c.metaSetNames ?? []).map((metaId, idx) => {
      const meta = metasets.find((m) => m.name === metaId)
      const iconId = (meta?.iconId ?? DEFAULT_METASET_ICON_ID) as MetasetIconId
      return { key: `${metaId}-${idx}`, name: meta?.name || metaId, iconId }
    })

    if (opts.showSetIcons) {
      const metasetTextEntries = metaEntries.filter((e) => e.iconId === DEFAULT_METASET_ICON_ID)
      const metasetIconEntries = metaEntries.filter((e) => e.iconId !== DEFAULT_METASET_ICON_ID)
      const nodes: JSX.Element[] = []
      let isFirst = true

      const pushNode = (
        key: string,
        children: React.ReactNode,
        sx: Record<string, unknown>,
      ) => {
        nodes.push(
          <Box key={key} component="span" sx={{ ...(!isFirst ? { ml: 0.35 } : {}), ...sx }}>
            {children}
          </Box>,
        )
        isFirst = false
      }

      if (metasetTextEntries.length > 0) {
        pushNode(
          'metaset-text',
          metasetTextEntries.map((e) => String(e.name)).join(', '),
          { display: 'inline', overflowWrap: 'anywhere' },
        )
      }

      metasetIconEntries.forEach((entry, idx) => {
        const option = metasetIconOptionById(entry.iconId)
        pushNode(`meta-set-${entry.key}-icon-${idx}`, option.glyph, {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: METASET_ICON_BOX_PX,
          height: METASET_ICON_BOX_PX,
          lineHeight: 1,
          textAlign: 'center',
          fontSize: 'inherit',
        })
      })

      setIdsSorted.forEach((id, idx) => {
        const localizedName = withNbsp(
          opts.t ? getLocalizedGearSetName(id, opts.t, opts.lang) : artifactSetName(id),
        )
        pushNode(
          `set-icon-${id}-${idx}`,
          <SetIcon setId={id} label={localizedName} sx={{ mr: 0, verticalAlign: `${SET_ICON_OFFSET_EM}em` }} />,
          { display: 'inline-flex', alignItems: 'center', verticalAlign: `${SET_ICON_OFFSET_EM}em` },
        )
      })

      excludedSetIds.forEach((id, idx) => {
        const localizedName = withNbsp(
          opts.t ? getLocalizedGearSetName(id, opts.t, opts.lang) : artifactSetName(id),
        )
        pushNode(
          `set-excluded-${id}-${idx}`,
          <Box component="span" sx={{ textDecoration: 'line-through' }}>{localizedName}</Box>,
          { display: 'inline-flex', alignItems: 'center' },
        )
      })

      if (nodes.length > 0) {
        // "Per Set: " prefix when this rule splits its quota by set/metaset.
        addNode(
          <Box component="span" sx={{ display: 'inline', whiteSpace: 'normal' }}>
            {perSet && <Box component="span">{`${opts.t ? opts.t('safeguardsCountModePerSet') : 'Per Set'}:${NBSP}`}</Box>}
            {nodes}
          </Box>,
        )
      } else if (perSet) {
        addText(opts.t ? opts.t('safeguardsCountModePerSet') : 'Per Set')
      }
    } else {
      const metaNames = metaEntries.map((e) => String(e.name))
      const includedNames = setIdsSorted.map((id) =>
        withNbsp(opts.t ? getLocalizedGearSetName(id, opts.t, opts.lang) : artifactSetName(id)),
      )
      const excludedNames = excludedSetIds.map((id) =>
        withNbsp(opts.t ? getLocalizedGearSetName(id, opts.t, opts.lang) : artifactSetName(id)),
      )
      const nodes: JSX.Element[] = []
      const pushText = (key: string, child: React.ReactNode, strike?: boolean) => {
        if (nodes.length > 0) nodes.push(<Box key={`${key}-sep`} component="span">, </Box>)
        nodes.push(
          <Box key={key} component="span" {...(strike ? { sx: { textDecoration: 'line-through' } } : {})}>
            {child}
          </Box>,
        )
      }
      metaNames.forEach((name, idx) => pushText(`meta-${idx}`, name))
      includedNames.forEach((name, idx) => pushText(`set-${idx}`, name))
      excludedNames.forEach((name, idx) => pushText(`set-excluded-${idx}`, name, true))
      if (nodes.length > 0) {
        // "Per Set: " prefix when this rule splits its quota by set/metaset.
        addNode(
          <Box component="span">
            {perSet && <Box component="span">{`${opts.t ? opts.t('safeguardsCountModePerSet') : 'Per Set'}:${NBSP}`}</Box>}
            {nodes}
          </Box>,
        )
      } else if (perSet) {
        addText(opts.t ? opts.t('safeguardsCountModePerSet') : 'Per Set')
      }
    }
  }

  if (parts.length === 0) return null
  // Interleave sections with pipe separators, exactly like RecipeChip.
  const withSeps: JSX.Element[] = []
  parts.forEach((p, i) => {
    withSeps.push(p)
    if (i < parts.length - 1) withSeps.push(<Box key={`sep-after-${p.key}`} component="span"> | </Box>)
  })
  return <>{withSeps}</>
}
