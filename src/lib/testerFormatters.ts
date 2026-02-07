import { ACCESSORY_NO_SET_ID } from './constants'
import { getLocalizedGearSetName, type ArtifactSetId, type ArtifactTypeId } from './types'
import { isAccessorySlot } from './testerDomain'

type TranslateFn = (key: string | number, params?: Record<string, string | number>) => string

export function formatTesterSetLabel({ setId, slot, translate, lang }: { setId: number | null | undefined; slot: ArtifactTypeId; translate: TranslateFn; lang: string }): string {
  // Normalize to a numeric id so we can treat sentinels consistently.
  const numeric = Number(setId)
  // Unknown/invalid ids should show the tester "unknown" placeholder.
  if (!Number.isFinite(numeric)) {
    return translate('testerValueUnknown')
  }
  // Accessories can carry the special no-set sentinel; other slots cannot.
  const slotIsAccessory = isAccessorySlot(slot)
  if (numeric === 0) {
    return translate('testerValueUnknown')
  }
  // Respect the no-set sentinel only for accessory slots.
  if (slotIsAccessory && numeric === ACCESSORY_NO_SET_ID) {
    return translate('noSetAccessories')
  }
  // Fall back to localized set labels for all real set ids.
  return getLocalizedGearSetName(numeric as ArtifactSetId, (key) => translate(key), lang)
}
