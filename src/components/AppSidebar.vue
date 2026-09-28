<script setup lang="ts">
import { House, Settings } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolIcon from '@/components/ToolIcon.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToolboxStore } from '@/stores/toolbox'
import { toolRegistry } from '@/tools/registry'

const { t } = useI18n()
const toolbox = useToolboxStore()

const pinnedTools = computed(() => toolbox.favoriteTools.length
  ? toolbox.favoriteTools
  : toolRegistry.slice(0, 7))
</script>

<template>
  <aside class="flex h-dvh flex-col justify-between bg-sidebar px-2 pb-12 pt-2">
    <nav class="grid gap-1">
      <Tooltip>
        <TooltipTrigger as-child>
          <RouterLink to="/home">
            <Button variant="ghost" size="icon" class="rounded-lg" :class="$route.path === '/home' ? 'bg-muted' : ''" :aria-label="t('home.label')">
              <House class="size-5" />
            </Button>
          </RouterLink>
        </TooltipTrigger>
        <TooltipContent side="right" :side-offset="5">
          {{ t('home.label') }}
        </TooltipContent>
      </Tooltip>
      <div class="my-1 h-px bg-border" />
      <Tooltip v-for="tool in pinnedTools" :key="tool.path">
        <TooltipTrigger as-child>
          <RouterLink :to="tool.path">
            <Button
              variant="ghost"
              size="icon"
              :class="tool.path === $route.path ? 'bg-muted' : ''"
              class="rounded-lg"
              :aria-label="t(tool.titleKey)"
            >
              <ToolIcon :name="tool.icon" class="size-5" />
            </Button>
          </RouterLink>
        </TooltipTrigger>
        <TooltipContent side="right" :side-offset="5">
          {{ t(tool.titleKey) }}
        </TooltipContent>
      </Tooltip>
    </nav>
    <div>
      <Tooltip>
        <TooltipTrigger as-child>
          <RouterLink to="/settings">
            <Button
              variant="ghost"
              size="icon"
              :class="'/settings' === $route.path ? 'bg-muted' : ''"
              class="mt-auto rounded-lg"
              :aria-label="t('settings.label')"
            >
              <Settings class="size-5" />
            </Button>
          </RouterLink>
        </TooltipTrigger>
        <TooltipContent side="right" :side-offset="5">
          {{ t('settings.label') }}
        </TooltipContent>
      </Tooltip>
    </div>
  </aside>
</template>
