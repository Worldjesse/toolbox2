<script setup lang="ts">
defineProps<{ title: string; desc?: string }>()
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header class="border-b border-border px-1 pb-3">
      <h2 class="text-lg font-semibold tracking-tight">
        {{ title }}
      </h2>
      <p v-if="desc" class="mt-1 text-sm text-muted-foreground">
        {{ desc }}
      </p>
    </header>
    <div class="min-h-0 flex-1 overflow-auto pt-4">
      <slot />
    </div>
  </div>
</template>
