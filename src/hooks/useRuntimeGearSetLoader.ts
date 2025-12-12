import { useCallback } from 'react'
import type { useI18n } from '../lib/i18n'
import { registerRuntimeGearSetsPayload } from '../lib/gearSets/runtimeStore'

type Translator = ReturnType<typeof useI18n>['t']

export interface UseRuntimeGearSetLoaderParams {
  setToastOpen: (open: boolean) => void
  setToastMsg: (msg: string) => void
  t: Translator
}

export function useRuntimeGearSetLoader({
  setToastOpen,
  setToastMsg,
  t,
}: UseRuntimeGearSetLoaderParams) {
  const handleRuntimeGearSets = useCallback(async (file: File) => {
    try {
      const payloadText = await file.text()
      const data = JSON.parse(payloadText) as unknown
      const result = registerRuntimeGearSetsPayload(data)
      if (!result.appliedIds.length) throw new Error('No gear sets applied')
      setToastMsg(t('toastGearSetsLoaded', { count: result.appliedIds.length }))
      setToastOpen(true)
    } catch {
      setToastMsg(t('toastGearSetsLoadFailed'))
      setToastOpen(true)
    }
  }, [setToastMsg, setToastOpen, t])

  return { handleRuntimeGearSets }
}
