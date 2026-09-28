<script setup lang="ts">
import { Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

defineEmits<{ openCommand: [] }>()
const { t } = useI18n()
</script>

<template>
  <header class="flex h-10 items-center justify-between border-b border-border bg-sidebar px-3">
    <RouterLink to="/home" class="text-sm font-semibold">
      {{ t('home.title') }}
    </RouterLink>
    <button
      type="button"
      class="flex h-7 min-w-48 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-accent"
      @click="$emit('openCommand')"
    >
      <Search class="size-4" />
      <span class="flex-1 text-left">{{ t('command.placeholder') }}</span>
      <kbd class="rounded border border-border bg-muted px-1">Ctrl K</kbd>
    </button>
  </header>
</template>
