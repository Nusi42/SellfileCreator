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
} from '../lib/types'
import {
  GLYPH_BEAT_EQUIPPED,
  GLYPH_FOR_ALL,
  GLYPH_PER_FACTION,
  GLYPH_PER_MAIN_STAT,
  GLYPH_PER_SET,
  GLYPH_PER_SLOT,
  GLYPH_PER_SUBSTAT,
  NBSP,
} from '../lib/constants'

const METASET_ICON_BOX_PX = 16
import { SafeguardSubstatMatch } from '../lib/safeguards'
import type { SafeguardRule } from '../lib/safeguards'
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

  // ── Slots ─────────────────────────────────────────────────────────────────
  if (c.slots && c.slots.length > 0) {
    const sorted = [...c.slots].sort(compareArtifactTypes)
    if (opts.showSlotIcons) {
      const nodes = sorted.map((typeId, i) => {
        const Icon = artifactTypeIconFor(typeId)
        if (Icon) {
          return (
            <Box
              key={`slot-${typeId}-${i}`}
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
        return <Box key={`slot-${typeId}-${i}`} component="span" sx={{ mr: 0.5 }}>{label}</Box>
      })
      // Per-slot glyph follows the icons; ∀ when no specific slots selected.
      addNode(<>{nodes}{rule.countMode.perSlot ? <Box key="slot-per" component="span">{NBSP}{GLYPH_PER_SLOT}</Box> : null}</>)
    } else {
      const labels = sorted.map((typeId) =>
        withNbsp(opts.t ? opts.t(artifactTypeI18nKey(typeId)) : artifactTypeName(typeId)),
      )
      addText(labels.join(', ') + (rule.countMode.perSlot ? `${NBSP}${GLYPH_PER_SLOT}` : ''))
    }
  } else if (rule.countMode.perSlot) {
    // No slot filter — perSlot applies to every slot; show glyph + ∀.
    addText(`${GLYPH_PER_SLOT}${NBSP}${GLYPH_FOR_ALL}`)
  }

  // ── Ranks ─────────────────────────────────────────────────────────────────
  if (c.ranks && c.ranks.length > 0) {
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
    addText(c.ranks.map((r) => rankLabel(Number(r))).join('/'))
  }

  // ── Factions ──────────────────────────────────────────────────────────────
  if (c.factions && c.factions.length > 0) {
    const factNodes = c.factions.map((factionCode, i) => {
      const rawLabel = opts.t ? opts.t(factionI18nKey(factionCode)) : factionCodeToName(factionCode)
      const label = withNbsp(rawLabel)
      if (opts.showFactionIcons) {
        return (
          <Box
            key={`f-${factionCode}-${i}`}
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
      return <Box key={`f-${factionCode}-${i}`} component="span">{label}</Box>
    })
    // Per-faction glyph follows the content; ∀ when no specific factions selected.
    addNode(<>{factNodes}{rule.countMode.perFaction ? <Box key="fact-per" component="span">{NBSP}{GLYPH_PER_FACTION}</Box> : null}</>)
  } else if (rule.countMode.perFaction) {
    addText(`${GLYPH_PER_FACTION}${NBSP}${GLYPH_FOR_ALL}`)
  }

  // ── Main stats ────────────────────────────────────────────────────────────
  if (c.mainStats && c.mainStats.length > 0) {
    const sorted = [...c.mainStats].sort(compareVariants)
    const nodes = sorted.map((vk, i) => {
      const name = withNbsp(opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
      const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
      return (
        <Box key={`m-${vk}-${i}`} component="span" sx={{ color: opts.useStatButtonColors ? fg : undefined }}>
          {name}
        </Box>
      )
    })
    const interleaved: JSX.Element[] = []
    nodes.forEach((n, i) => {
      interleaved.push(n)
      if (i < nodes.length - 1) interleaved.push(<Box key={`m-sep-${i}`} component="span">, </Box>)
    })
    // Per-mainstat glyph follows the content; ∀ when no specific main stats selected.
    addNode(<>{interleaved}{rule.countMode.perMainStat ? <Box key="main-per" component="span">{NBSP}{GLYPH_PER_MAIN_STAT}</Box> : null}</>)
  } else if (rule.countMode.perMainStat) {
    addText(`${GLYPH_PER_MAIN_STAT}${NBSP}${GLYPH_FOR_ALL}`)
  }

  // ── Substats ──────────────────────────────────────────────────────────────
  // Safeguard substats have no roll bounds or targets, so this is simpler than
  // the recipe equivalent. We still color them per the substatColors mapping.
  if (rule.substats && rule.substats.length > 0) {
    const sorted = [...rule.substats].sort(compareVariants)
    const nodes = sorted.map((vk, i) => {
      const name = withNbsp(opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
      const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
      return (
        <Box key={`s-${vk}-${i}`} component="span" sx={{ color: opts.useStatButtonColors ? fg : undefined }}>
          {name}
        </Box>
      )
    })
    const interleaved: JSX.Element[] = []
    nodes.forEach((n, i) => {
      interleaved.push(n)
      if (i < nodes.length - 1) interleaved.push(<Box key={`s-sep-${i}`} component="span">, </Box>)
    })
    const tr = opts.t
    // Per-substat glyph when each substat is counted separately (PerSubstat mode).
    addNode(
      <>
        <Box component="span">{`${tr ? tr('chipSubs') : 'Subs'}:${NBSP}`}</Box>
        {interleaved}
        {rule.substatMatch === SafeguardSubstatMatch.PerSubstat ? <Box key="sub-per" component="span">{NBSP}{GLYPH_PER_SUBSTAT}</Box> : null}
      </>,
    )
  }

  // ── Beat-equipped quality floor ───────────────────────────────────────────
  // Only shown when the floor is active; rendered as "📈 ≥ N%" after substats.
  if (rule.beatEquippedPercentile !== null && rule.beatEquippedPercentile !== undefined) {
    addText(`${GLYPH_BEAT_EQUIPPED}${NBSP}≥${NBSP}${rule.beatEquippedPercentile}%`)
  }

  // ── Sets + Metasets ───────────────────────────────────────────────────────
  {
    const setSelection = splitArtifactSetSelections(c.sets)
    const setIdsSorted = setSelection.included.slice().sort((a, b) => Number(a) - Number(b))
    const excludedSetIds = setSelection.excluded.slice().sort((a, b) => Number(a) - Number(b))
    const metaEntries = (c.metaSetIds ?? []).map((metaId, idx) => {
      const meta = metasets.find((m) => m.id === metaId)
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
        // Per-set glyph follows the set icons; ∀ when no specific sets selected.
        addNode(
          <Box component="span" sx={{ display: 'inline', whiteSpace: 'normal' }}>
            {nodes}
            {rule.countMode.perSet ? <Box key="set-per" component="span">{NBSP}{GLYPH_PER_SET}</Box> : null}
          </Box>,
        )
      } else if (rule.countMode.perSet) {
        addText(`${GLYPH_PER_SET}${NBSP}${GLYPH_FOR_ALL}`)
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
        addNode(
          <Box component="span">
            {nodes}
            {rule.countMode.perSet ? <Box key="set-per" component="span">{NBSP}{GLYPH_PER_SET}</Box> : null}
          </Box>,
        )
      } else if (rule.countMode.perSet) {
        addText(`${GLYPH_PER_SET}${NBSP}${GLYPH_FOR_ALL}`)
      }
    }
  }

  if (parts.length === 0) return null
  // Interleave sections with pipe separators, exactly like RecipeChip.
  const withSeps: JSX.Element[] = []
  parts.forEach((p, i) => {
    withSeps.push(p)
    if (i < parts.length - 1) withSeps.push(<Box key={`sep-${i}`} component="span"> | </Box>)
  })
  return <>{withSeps}</>
}
