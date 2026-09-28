<script setup lang="ts">
import { Star } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolIcon from '@/components/ToolIcon.vue'
import { useToolboxStore } from '@/stores/toolbox'
import { toolCategories, toolRegistry } from '@/tools/registry'

const { t } = useI18n({ useScope: 'global' })
const toolbox = useToolboxStore()
const sections = computed(() => toolCategories
  .map(category => ({
    ...category,
    tools: toolRegistry.filter(tool => tool.category === category.id),
  }))
  .filter(category => category.tools.length))
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">
        {{ t('home.title') }}
      </h1>
      <p class="mt-2 text-muted-foreground">
        {{ t('home.subtitle') }}
      </p>
    </div>

    <section v-if="toolbox.favoriteTools.length" class="space-y-3">
      <h2 class="text-sm font-semibold text-muted-foreground">
        {{ t('home.favorites') }}
      </h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink v-for="tool in toolbox.favoriteTools" :key="tool.id" :to="tool.path" class="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent/40">
          <ToolIcon :name="tool.icon" class="size-5" />
          <span class="text-sm font-medium">{{ t(tool.titleKey) }}</span>
        </RouterLink>
      </div>
    </section>

    <section v-if="toolbox.recentTools.length" class="space-y-3">
      <h2 class="text-sm font-semibold text-muted-foreground">
        {{ t('home.recent') }}
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink v-for="tool in toolbox.recentTools" :key="tool.id" :to="tool.path" class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
          <ToolIcon :name="tool.icon" class="size-4" />
          {{ t(tool.titleKey) }}
        </RouterLink>
      </div>
    </section>

    <section v-for="section in sections" :key="section.id" class="space-y-3">
      <h2 class="text-sm font-semibold text-muted-foreground">
        {{ t(section.labelKey) }}
      </h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink v-for="tool in section.tools" :key="tool.id" :to="tool.path" class="rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:bg-accent/40">
          <div class="flex items-start justify-between gap-2">
            <ToolIcon :name="tool.icon" class="size-6" />
            <Star v-if="toolbox.isFavorite(tool.id)" class="size-4 fill-current text-primary" />
          </div>
          <div class="mt-3 font-medium">
            {{ t(tool.titleKey) }}
          </div>
          <div class="mt-1 text-sm text-muted-foreground">
            {{ t(tool.descKey) }}
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
