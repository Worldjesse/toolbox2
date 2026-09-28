import type { Ref } from 'vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'

export function useToolDraft<T>(toolId: string, field: string, initialValue: T): Ref<T> {
  const value = ref(initialValue) as Ref<T>
  const settings = useSettingsStore()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stop: (() => void) | undefined

  void settings.getSetting<T>(`draft.${toolId}.${field}`).then((saved) => {
    if (saved !== undefined)
      value.value = saved
    stop = watch(value, (nextValue) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void settings.setSetting(`draft.${toolId}.${field}`, nextValue)
      }, 250)
    }, { deep: true })
  })

  onBeforeUnmount(() => {
    stop?.()
    clearTimeout(timer)
  })

  return value
}
