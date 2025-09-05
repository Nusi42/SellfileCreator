/**
 * Shared artifact type icon mapping.
 * Why: keep a single source of truth for slot icons so the Builder and ConfigChip
 * render the same visuals and we avoid duplicating icon lists across files.
 *
 * This file implements small inline SVGs (Material Symbols-inspired) to keep
 * the bundle self-contained without external fonts or icon packages.
 */
// React types are picked up via jsx, no runtime import needed.
import type { ArtifactTypeId } from '../lib/types'
import { ArtifactType, artifactTypeName } from '../lib/types'

type FontSizeProp = 'inherit' | 'small' | 'medium' | 'large' | undefined
type LocalIcon = (props: { fontSize?: FontSizeProp }) => JSX.Element

function sizeFor(fontSize: FontSizeProp): { w: string | number; h: string | number } {
  if (!fontSize || fontSize === 'inherit') return { w: '1em', h: '1em' }
  if (fontSize === 'small') return { w: 20, h: 20 }
  if (fontSize === 'large') return { w: 36, h: 36 }
  return { w: 24, h: 24 }
}

// Weapon — Material Symbols: swords (outlined, 24px)
const WeaponIcon: LocalIcon = ({ fontSize }) => {
  const { w, h } = sizeFor(fontSize)
  return (
    <svg width={w} height={h} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
      <path d="M762-96 645-212l-88 88-28-28q-23-23-23-57t23-57l169-169q23-23 57-23t57 23l28 28-88 88 116 117q12 12 12 28t-12 28l-50 50q-12 12-28 12t-28-12Zm118-628L426-270l5 4q23 23 23 57t-23 57l-28 28-88-88L198-96q-12 12-28 12t-28-12l-50-50q-12-12-12-28t12-28l116-117-88-88 28-28q23-23 57-23t57 23l4 5 454-454h160v160ZM334-583l24-23 23-24-23 24-24 23Zm-56 57L80-724v-160h160l198 198-57 56-174-174h-47v47l174 174-56 57Zm92 199 430-430v-47h-47L323-374l47 47Zm0 0-24-23-23-24 23 24 24 23Z"/>
    </svg>
  )
}

// Helmet — Material Symbols: sports_motorsports (outlined, 24px)
const HelmetIcon: LocalIcon = ({ fontSize }) => {
  const { w, h } = sizeFor(fontSize)
  return (
    <svg width={w} height={h} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
      <path d="M480-480Zm80 240q100 0 170-70t70-170q0-101-73.5-170.5T550-720q-48 0-93 11t-87 33l100 40q41 17 65.5 52.5T560-504q0 60-41.5 102T418-360H162q-2 24-2 54.5v65.5h400ZM176-440h240q27 0 45.5-18.5T480-504q0-19-10.5-34.5T440-562l-148-60q-42 37-71.5 84T176-440Zm384 280H160q-33 0-56.5-23.5T80-240v-90q0-98 37-183.5t100.5-149Q281-726 367-763t183-37q68 0 128 25t105 68.5Q828-663 854-605t26 125q0 66-25 124.5t-68.5 102Q743-210 684.5-185T560-160Z"/>
    </svg>
  )
}

// Shield — Material Symbols: shield (outlined, 24px)
const ShieldIcon: LocalIcon = ({ fontSize }) => {
  const { w, h } = sizeFor(fontSize)
  return (
    <svg width={w} height={h} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
      <path d="M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z"/>
    </svg>
  )
}

// Gauntlets — Material Symbols: hand_bones (outlined, 24px)
const HandBonesIcon: LocalIcon = ({ fontSize }) => {
  const { w, h } = sizeFor(fontSize)
  return (
    <svg width={w} height={h} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
      <path d="M183-380q-8 4-16.5.5T155-391l-30-80q-5-14-4.5-27.5T133-517q25-10 46.5 7t32.5 44l16 43q3 8 .5 14.5T219-398l-36 18ZM433-80q-17 0-33.5-7T372-107L210-294q-11-13-10-29t14-27q13-11 29-9.5t27 13.5l90 103q0-8 2-15.5t6-15.5l-46-132q-5-16 2-31t23-20q16-5 31 2t20 23l39 112h23v-120q0-17 11.5-28.5T500-480q17 0 28.5 11.5T540-440v120h24l21-89q4-17 17.5-25.5T633-439q17 4 25.5 17.5T663-391l-16 71q5 1 10.5 2t10.5 3l15-39q6-16 21-23t31-1q15 6 21.5 21t.5 31l-37 98v68q0 33-23.5 56.5T640-80H433ZM311-699q-8 1-14.5-4.5T289-717l-9-79q-2-17 8.5-29.5T316-840q17-2 29.5 8.5T360-804l8 79q1 8-4.5 14.5T350-703l-39 4Zm22 204q-9 2-16.5-3t-8.5-14l-12-104q-2-17 8.5-29.5T332-660q17-2 29.5 8.5T376-624l11 97q1 8-3 14t-12 8l-39 10Zm107 335h200v-80H440v80Zm40-360q-8 0-14-6t-6-14v-100q0-17 11.5-28.5T500-680q17 0 28.5 11.5T540-640v100q0 8-6 14t-14 6h-40Zm0-200q-8 0-14-6t-6-14v-100q0-17 11.5-28.5T500-880q17 0 28.5 11.5T540-840v100q0 8-6 14t-14 6h-40Zm175 246-40-10q-8-2-12-8t-3-14l11-98q2-17 14.5-27.5T655-640q17 2 27.5 14.5T691-596l-11 105q-1 9-8.5 14t-16.5 3Zm23-201-40-4q-8-1-13.5-7.5T620-701l8-79q2-17 14.5-27.5T672-816q17 2 27.5 14.5T708-772l-8 79q-1 8-7.5 13.5T678-675Zm80 265-39-12q-8-2-11.5-9t-1.5-15l15-56q5-16 19-24.5t30-3.5q16 5 24 18.5t4 29.5l-15 58q-2 8-9.5 12t-15.5 2Zm42-151-39-10q-8-2-12-9.5t-2-15.5l13-46q7-24 17-45t31-16q25 6 30 33t-3 56l-11 39q-2 8-9 12t-15 2ZM440-160h200-200Z"/>
    </svg>
  )
}

// Chestplate — Material Symbols: apparel (outlined, 24px)
const ApparelIcon: LocalIcon = ({ fontSize }) => {
  const { w, h } = sizeFor(fontSize)
  return (
    <svg width={w} height={h} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
      <path d="m240-522-40 22q-14 8-30 4t-24-18L66-654q-8-14-4-30t18-24l230-132h70q9 0 14.5 5.5T400-820v20q0 33 23.5 56.5T480-720q33 0 56.5-23.5T560-800v-20q0-9 5.5-14.5T580-840h70l230 132q14 8 18 24t-4 30l-80 140q-8 14-23.5 17.5T760-501l-40-20v361q0 17-11.5 28.5T680-120H280q-17 0-28.5-11.5T240-160v-362Zm80-134v456h320v-456l124 68 42-70-172-100q-15 51-56.5 84.5T480-640q-56 0-97.5-33.5T326-758L154-658l42 70 124-68Zm160 177Z"/>
    </svg>
  )
}

// Boots — Material Symbols: footprint (outlined, 24px)
const FootprintIcon: LocalIcon = ({ fontSize }) => {
  const { w, h } = sizeFor(fontSize)
  return (
    <svg width={w} height={h} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
      <path d="M260-840q-45 0-72.5 50T160-680q0 63 17.5 111.5T210-496l110-22q13-32 26.5-73t13.5-89q0-60-27.5-110T260-840Zm55 520q19 0 32-14t13-39q0-17-8-35t-16-32l-96 20q0 40 17.5 70t57.5 30Zm385-320q-45 0-72.5 50T600-480q0 48 13.5 88.5T640-318l110 22q15-24 32.5-72T800-480q0-60-27.5-110T700-640Zm-55 520q40 0 57.5-30t17.5-70l-96-20q-8 14-16 32t-8 35q0 20 12.5 36.5T645-120ZM315-240q-77 0-117-57t-38-128l-18-27q-11-17-36.5-77T80-680q0-103 51-171.5T260-920q85 0 132.5 75.5T440-680q0 58-16 107t-28 79l8 13q8 14 22 44.5t14 63.5q0 57-35.5 95T315-240ZM645-40q-54 0-89.5-38T520-173q0-33 14-63.5t22-44.5l8-13q-12-30-28-79t-16-107q0-89 47.5-164.5T700-720q78 0 129 68.5T880-480q0 91-25.5 150.5T818-253l-18 28q1 71-38.5 128T645-40Z"/>
    </svg>
  )
}

// Ring — Material Symbols: diamond (outlined, 24px)
const DiamondIcon: LocalIcon = ({ fontSize }) => {
  const { w, h } = sizeFor(fontSize)
  return (
    <svg width={w} height={h} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
      <path d="M480-120 80-600l120-240h560l120 240-400 480Zm-95-520h190l-60-120h-70l-60 120Zm55 347v-267H218l222 267Zm80 0 222-267H520v267Zm144-347h106l-60-120H604l60 120Zm-474 0h106l60-120H250l-60 120Z"/>
    </svg>
  )
}

// Amulet — Material Symbols: recenter (outlined, 24px)
const RecenterIcon: LocalIcon = ({ fontSize }) => {
  const { w, h } = sizeFor(fontSize)
  return (
    <svg width={w} height={h} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
      <path d="M440-40v-167l-44 43-56-56 140-140 140 140-56 56-44-43v167h-80ZM220-340l-56-56 43-44H40v-80h167l-43-44 56-56 140 140-140 140Zm520 0L600-480l140-140 56 56-43 44h167v80H753l43 44-56 56Zm-260-80q-25 0-42.5-17.5T420-480q0-25 17.5-42.5T480-540q25 0 42.5 17.5T540-480q0 25-17.5 42.5T480-420Zm0-180L340-740l56-56 44 43v-167h80v167l44-43 56 56-140 140Z"/>
    </svg>
  )
}

// Banner — Material Symbols: flag (outlined, 24px)
const FlagIcon: LocalIcon = ({ fontSize }) => {
  const { w, h } = sizeFor(fontSize)
  return (
    <svg width={w} height={h} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
      <path d="M200-120v-680h360l16 80h224v400H520l-16-80H280v280h-80Zm300-440Zm86 160h134v-240H510l-16-80H280v240h290l16 80Z"/>
    </svg>
  )
}

export type ArtifactTypeIconDef = {
  id: ArtifactTypeId
  name: string
  Icon: LocalIcon
}

/** Ordered list used in the Builder slots grid and elsewhere. */
export const artifactTypeIconList: readonly ArtifactTypeIconDef[] = [
  { id: ArtifactType.Weapon, name: 'Weapon', Icon: WeaponIcon },
  { id: ArtifactType.Helmet, name: 'Helmet', Icon: HelmetIcon },
  { id: ArtifactType.Shield, name: 'Shield', Icon: ShieldIcon },
  { id: ArtifactType.Gauntlets, name: 'Gauntlets', Icon: HandBonesIcon },
  { id: ArtifactType.Chestplate, name: 'Chestplate', Icon: ApparelIcon },
  { id: ArtifactType.Boots, name: 'Boots', Icon: FootprintIcon },
  { id: ArtifactType.Ring, name: 'Ring', Icon: DiamondIcon },
  { id: ArtifactType.Amulet, name: 'Amulet', Icon: RecenterIcon },
  { id: ArtifactType.Banner, name: 'Banner', Icon: FlagIcon },
] as const

/** Fast lookup for an icon component by artifact type id. */
export function artifactTypeIconFor(id: ArtifactTypeId): LocalIcon | null {
  const found = artifactTypeIconList.find((e) => Number(e.id) === Number(id))
  return found ? found.Icon : null
}

/** Convenience: label from id (delegates to catalog). */
export function artifactTypeLabel(id: ArtifactTypeId): string {
  return artifactTypeName(id)
}
