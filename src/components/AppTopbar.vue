<script setup lang="ts">
import { Blocks, Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

defineEmits<{ openCommand: [] }>()
const { t } = useI18n()
</script>

<template>
  <header
    data-tauri-decorum-tb
    data-tauri-drag-region
    class="app-titlebar flex h-10 items-center border-b border-sidebar-border bg-sidebar pl-2.5 text-sidebar-foreground"
  >
    <RouterLink to="/home" class="flex items-center gap-2 text-sm font-semibold">
      <span class="flex size-6 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
        <Blocks class="size-3.5" />
      </span>
      <span>{{ t('home.title') }}</span>
    </RouterLink>
    <div data-tauri-drag-region class="min-w-4 flex-1 self-stretch" />
    <button
      type="button"
      class="mr-2 flex h-7 w-56 items-center gap-2 rounded-md border border-white/10 bg-white/8 px-2.5 text-xs text-sidebar-foreground/65 transition-colors hover:bg-white/12 hover:text-sidebar-foreground"
      @click="$emit('openCommand')"
    >
      <Search class="size-4" />
      <span class="flex-1 text-left">{{ t('command.placeholder') }}</span>
      <kbd class="rounded border border-white/10 bg-black/10 px-1.5 py-0.5 text-[10px] text-sidebar-foreground/55">Ctrl K</kbd>
    </button>
  </header>
</template>
