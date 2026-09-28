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
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex items-start justify-between gap-3 border-b border-border px-1 pb-3">
      <div class="min-w-0">
        <h2 class="text-lg font-semibold tracking-tight">
          {{ title }}
        </h2>
        <p v-if="desc" class="mt-1 text-sm text-muted-foreground">
          {{ desc }}
        </p>
      </div>
      <Button
        v-if="tool"
        variant="ghost"
        size="icon"
        :aria-label="toolbox.isFavorite(tool.id) ? '取消收藏' : '收藏工具'"
        :title="toolbox.isFavorite(tool.id) ? '取消收藏' : '收藏工具'"
        @click="toolbox.toggleFavorite(tool.id)"
      >
        <Star class="size-5" :class="toolbox.isFavorite(tool.id) ? 'fill-current' : ''" />
      </Button>
    </header>
    <div class="min-h-0 flex-1 overflow-auto pt-4">
      <slot />
    </div>
  </div>
</template>
