import { ACCESSORY_NO_SET_ID } from './constants'
import { artifactSetI18nKey, artifactSetName, type ArtifactSetId, type ArtifactTypeId } from './types'
import { isAccessorySlot } from './testerDomain'

type TranslateFn = (key: string | number, params?: Record<string, string | number>) => string

export function formatTesterSetLabel({ setId, slot, translate }: { setId: number | null | undefined; slot: ArtifactTypeId; translate: TranslateFn }): string {
  const numeric = Number(setId)
  if (!Number.isFinite(numeric)) {
    return translate('testerValueUnknown')
  }
  const slotIsAccessory = isAccessorySlot(slot)
  if (numeric === 0 || (slotIsAccessory && numeric === ACCESSORY_NO_SET_ID)) {
    return translate('testerValueUnknown')
  }
  const labelKey = artifactSetI18nKey(numeric as ArtifactSetId)
  const localized = translate(labelKey)
  if (localized && localized.trim().length > 0) {
    return localized
  }
  return artifactSetName(numeric as ArtifactSetId)
}
