import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { toolRegistry } from '@/tools/registry'

const MAX_RECENT = 8

export const useToolboxStore = defineStore('toolbox', () => {
  const favorites = ref<string[]>([])
  const recent = ref<string[]>([])
  const initialized = ref(false)
  const settings = useSettingsStore()

  const favoriteTools = computed(() => favorites.value
    .map(id => toolRegistry.find(tool => tool.id === id))
    .filter(tool => tool !== undefined))

  const recentTools = computed(() => recent.value
    .map(id => toolRegistry.find(tool => tool.id === id))
    .filter(tool => tool !== undefined))

  async function initialize() {
    if (initialized.value)
      return
    favorites.value = await settings.getSetting<string[]>('toolbox.favorites') ?? []
    recent.value = await settings.getSetting<string[]>('toolbox.recent') ?? []
    initialized.value = true
  }

  function isFavorite(id: string) {
    return favorites.value.includes(id)
  }

  async function toggleFavorite(id: string) {
    favorites.value = isFavorite(id)
      ? favorites.value.filter(item => item !== id)
      : [...favorites.value, id]
    await settings.setSetting('toolbox.favorites', favorites.value)
  }

  async function markUsed(id: string) {
    recent.value = [id, ...recent.value.filter(item => item !== id)].slice(0, MAX_RECENT)
    await settings.setSetting('toolbox.recent', recent.value)
  }

  return {
    favorites,
    recent,
    initialized,
    favoriteTools,
    recentTools,
    initialize,
    isFavorite,
    toggleFavorite,
    markUsed,
  }
})
