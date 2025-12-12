import { ACCESSORY_NO_SET_ID } from './constants'
import { getLocalizedGearSetName, type ArtifactSetId, type ArtifactTypeId } from './types'
import { isAccessorySlot } from './testerDomain'

type TranslateFn = (key: string | number, params?: Record<string, string | number>) => string

export function formatTesterSetLabel({ setId, slot, translate, lang }: { setId: number | null | undefined; slot: ArtifactTypeId; translate: TranslateFn; lang: string }): string {
  const numeric = Number(setId)
  if (!Number.isFinite(numeric)) {
    return translate('testerValueUnknown')
  }
  const slotIsAccessory = isAccessorySlot(slot)
  if (numeric === 0 || (slotIsAccessory && numeric === ACCESSORY_NO_SET_ID)) {
    return translate('testerValueUnknown')
  }
  return getLocalizedGearSetName(numeric as ArtifactSetId, (key) => translate(key), lang)
}
