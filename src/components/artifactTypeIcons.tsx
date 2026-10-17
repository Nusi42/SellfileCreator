/**
 * Shared artifact type icon mapping.
 * Why: keep a single source of truth for slot icons so the Builder and RecipeChip
 * render the same visuals and we avoid duplicating icon lists across files.
 *
 * Slot glyphs come from src/lib/iconMaps/gameIcons.ts: the asset pack's glyphs when
 * the build has it, else the project's own. Both are single SVG paths, so the bundle stays
 * single-file and the glyphs tint consistently via currentColor.
 */
// JSX namespace must be explicitly imported in React 19's type definitions.
import type { JSX } from 'react'
import type { ArtifactTypeId } from '../lib/types'
import { ArtifactType, artifactTypeName, PREFERRED_ARTIFACT_TYPE_ORDER } from '../lib/types'
import { useSlotTintColor } from '../lib/slotTintContext'
import { slotGlyph } from '../lib/iconMaps/gameIcons'

type FontSizeProp = 'inherit' | 'small' | 'medium' | 'large' | undefined
type LocalIcon = (props: { fontSize?: FontSizeProp }) => JSX.Element

function sizeFor(fontSize: FontSizeProp): { w: string | number; h: string | number } {
  if (!fontSize || fontSize === 'inherit') return { w: '1em', h: '1em' }
  if (fontSize === 'small') return { w: 20, h: 20 }
  if (fontSize === 'large') return { w: 36, h: 36 }
  return { w: 24, h: 24 }
}

export type ArtifactTypeIconDef = {
  id: ArtifactTypeId
  name: string
  Icon: LocalIcon
}

type SlotIconAsset = {
  readonly viewBox: string
  readonly path: string
}


const SLOT_ICON_BY_TYPE: Record<ArtifactType, SlotIconAsset> = {
  [ArtifactType.Weapon]: slotGlyph('Weapon'),
  [ArtifactType.Helmet]: slotGlyph('Helm'),
  [ArtifactType.Shield]: slotGlyph('Schild'),
  [ArtifactType.Gauntlets]: slotGlyph('Handschuh'),
  [ArtifactType.Chestplate]: slotGlyph('Brust'),
  [ArtifactType.Boots]: slotGlyph('Schuh'),
  [ArtifactType.Ring]: slotGlyph('Ring'),
  [ArtifactType.Amulet]: slotGlyph('Amulett'),
  [ArtifactType.Banner]: slotGlyph('Banner'),
}

// `slotId` lets the icon resolve its artifact/accessory tint from SlotTintContext. The SVG path uses
// fill="currentColor", so setting the svg `color` to the (already contrast-adapted) tint colours it;
// `undefined` ⇒ fall back to the inherited theme colour (flag off — unchanged behaviour).
function makeSlotIcon(asset: SlotIconAsset, slotId: ArtifactTypeId): LocalIcon {
  return ({ fontSize }) => {
    const { w, h } = sizeFor(fontSize)
    const tint = useSlotTintColor(slotId)
    return (
      <svg
        width={w}
        height={h}
        viewBox={asset.viewBox}
        fill="none"
        aria-hidden
        style={{ verticalAlign: '-0.15em', color: tint ?? 'inherit' }}
      >
        <path fill="currentColor" d={asset.path} />
      </svg>
    )
  }
}

const SLOT_ICON_COMPONENT_BY_TYPE: Record<ArtifactType, LocalIcon> = {
  [ArtifactType.Weapon]: makeSlotIcon(SLOT_ICON_BY_TYPE[ArtifactType.Weapon]!, ArtifactType.Weapon),
  [ArtifactType.Helmet]: makeSlotIcon(SLOT_ICON_BY_TYPE[ArtifactType.Helmet]!, ArtifactType.Helmet),
  [ArtifactType.Shield]: makeSlotIcon(SLOT_ICON_BY_TYPE[ArtifactType.Shield]!, ArtifactType.Shield),
  [ArtifactType.Gauntlets]: makeSlotIcon(SLOT_ICON_BY_TYPE[ArtifactType.Gauntlets]!, ArtifactType.Gauntlets),
  [ArtifactType.Chestplate]: makeSlotIcon(SLOT_ICON_BY_TYPE[ArtifactType.Chestplate]!, ArtifactType.Chestplate),
  [ArtifactType.Boots]: makeSlotIcon(SLOT_ICON_BY_TYPE[ArtifactType.Boots]!, ArtifactType.Boots),
  [ArtifactType.Ring]: makeSlotIcon(SLOT_ICON_BY_TYPE[ArtifactType.Ring]!, ArtifactType.Ring),
  [ArtifactType.Amulet]: makeSlotIcon(SLOT_ICON_BY_TYPE[ArtifactType.Amulet]!, ArtifactType.Amulet),
  [ArtifactType.Banner]: makeSlotIcon(SLOT_ICON_BY_TYPE[ArtifactType.Banner]!, ArtifactType.Banner),
}

/** Ordered list used in the Builder slots grid and elsewhere. */
export const artifactTypeIconList: readonly ArtifactTypeIconDef[] = PREFERRED_ARTIFACT_TYPE_ORDER.map((id) => ({
  id,
  name: artifactTypeName(id),
  Icon: SLOT_ICON_COMPONENT_BY_TYPE[id]!,
}))

export function artifactTypeIconFor(id: ArtifactTypeId): LocalIcon | null {
  const icon = SLOT_ICON_COMPONENT_BY_TYPE[Number(id) as ArtifactType]
  return icon ?? null
}

/** Convenience: label from id (delegates to catalog). */
export function artifactTypeLabel(id: ArtifactTypeId): string {
  return artifactTypeName(id)
}

/** Raw SVG asset for a slot — viewBox and path string — for custom rendering contexts. */
export function slotIconSvgAsset(id: ArtifactTypeId | string): { viewBox: string; path: string } | null {
  return SLOT_ICON_BY_TYPE[Number(id) as ArtifactType] ?? null
}
