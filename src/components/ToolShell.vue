<script setup lang="ts">
import { Star } from '@lucide/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useToolboxStore } from '@/stores/toolbox'
import { findToolByPath } from '@/tools/registry'

defineProps<{ title: string, desc?: string }>()
const route = useRoute()
const toolbox = useToolboxStore()
const tool = computed(() => findToolByPath(route.path))
</script>

<template>
  <div class="tool-shell flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_2px_oklch(0.2_0.03_190/0.04),0_14px_40px_oklch(0.2_0.03_190/0.05)]">
    <header class="flex items-start justify-between gap-3 border-b border-border bg-secondary/45 px-5 py-4">
      <div class="min-w-0">
        <h2 class="text-lg font-semibold">
          {{ title }}
        </h2>
        <p v-if="desc" class="mt-1 text-sm text-muted-foreground">
          {{ desc }}
        </p>
      </div>
      <Button
        v-if="tool"
        variant="outline"
        size="icon"
        :aria-label="toolbox.isFavorite(tool.id) ? '取消收藏' : '收藏工具'"
        :title="toolbox.isFavorite(tool.id) ? '取消收藏' : '收藏工具'"
        @click="toolbox.toggleFavorite(tool.id)"
      >
        <Star class="size-4" :class="toolbox.isFavorite(tool.id) ? 'fill-current text-amber-500' : ''" />
      </Button>
    </header>
    <div class="min-h-0 flex-1 overflow-auto p-5">
      <slot />
    </div>
  </div>
</template>
