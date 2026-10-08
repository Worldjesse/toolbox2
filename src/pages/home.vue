<script setup lang="ts">
import { ArrowUpRight, Clock3, Sparkles, Star } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolIcon from '@/components/ToolIcon.vue'
import { useToolboxStore } from '@/stores/toolbox'
import { toolCategories, toolRegistry } from '@/tools/registry'

const { t } = useI18n({ useScope: 'global' })
const toolbox = useToolboxStore()
const categoryStyles = {
  network: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300',
  data: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
  encoding: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  text: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  file: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  generator: 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300',
} as const
const sections = computed(() => toolCategories
  .map(category => ({
    ...category,
    tools: toolRegistry.filter(tool => tool.category === category.id),
  }))
  .filter(category => category.tools.length))
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-8 pb-8">
    <div class="flex items-center gap-4 py-2">
      <div class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_8px_24px_oklch(0.55_0.13_174/0.24)]">
        <Sparkles class="size-6" />
      </div>
      <div class="min-w-0">
        <h1 class="text-2xl font-bold">
          {{ t('home.title') }}
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t('home.subtitle') }}
        </p>
      </div>
    </div>

    <section v-if="toolbox.favoriteTools.length" class="space-y-3">
      <div class="flex items-center gap-2">
        <Star class="size-4 fill-amber-400 text-amber-500" />
        <h2 class="text-sm font-semibold">
          {{ t('home.favorites') }}
        </h2>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink v-for="tool in toolbox.favoriteTools" :key="tool.id" :to="tool.path" class="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-[0_1px_2px_oklch(0.2_0.03_190/0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md">
          <span class="flex size-9 items-center justify-center rounded-md" :class="categoryStyles[tool.category]">
            <ToolIcon :name="tool.icon" class="size-5" />
          </span>
          <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ t(tool.titleKey) }}</span>
          <ArrowUpRight class="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </RouterLink>
      </div>
    </section>

    <section v-if="toolbox.recentTools.length" class="space-y-3">
      <div class="flex items-center gap-2">
        <Clock3 class="size-4 text-muted-foreground" />
        <h2 class="text-sm font-semibold">
          {{ t('home.recent') }}
        </h2>
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink v-for="tool in toolbox.recentTools" :key="tool.id" :to="tool.path" class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-xs transition-colors hover:border-primary/30 hover:bg-accent">
          <ToolIcon :name="tool.icon" class="size-4" />
          {{ t(tool.titleKey) }}
        </RouterLink>
      </div>
    </section>

    <section v-for="section in sections" :key="section.id" class="space-y-3">
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full" :class="categoryStyles[section.id]" />
        <h2 class="text-sm font-semibold">
          {{ t(section.labelKey) }}
        </h2>
        <span class="text-xs text-muted-foreground">{{ section.tools.length }}</span>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink v-for="tool in section.tools" :key="tool.id" :to="tool.path" class="group rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_oklch(0.2_0.03_190/0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_8px_24px_oklch(0.2_0.03_190/0.08)]">
          <div class="flex items-start justify-between gap-2">
            <span class="flex size-10 items-center justify-center rounded-md" :class="categoryStyles[section.id]">
              <ToolIcon :name="tool.icon" class="size-5" />
            </span>
            <Star v-if="toolbox.isFavorite(tool.id)" class="size-4 fill-amber-400 text-amber-500" />
            <ArrowUpRight v-else class="size-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
          </div>
          <div class="mt-4 font-semibold">
            {{ t(tool.titleKey) }}
          </div>
          <div class="mt-1.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {{ t(tool.descKey) }}
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
