import { LazyStore } from '@tauri-apps/plugin-store'
import { defineStore } from 'pinia'

const store: LazyStore = new LazyStore('settings.json')
export const useSettingsStore = defineStore('settings', () => {
  async function getSetting<T>(key: string): Promise<T | undefined> {
    const value = await store.get<T>(key)
    return value ?? undefined
  }

  async function setSetting<T>(key: string, value: T) {
    await store.set(key, value)
    return await store.save()
  }

  async function getSettings() {
    return await store.entries<any>()
  }

  async function removeSettingsByPrefix(prefix: string) {
    const entries = await store.entries<any>()
    for (const [key] of entries) {
      if (key.startsWith(prefix))
        await store.delete(key)
    }
    await store.save()
  }

  return { getSetting, setSetting, getSettings, removeSettingsByPrefix }
})
