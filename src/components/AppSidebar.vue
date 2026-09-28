<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const { t } = useI18n()

const sidebarRoutes = [
  { name: 'home.label', icon: 'ph:house-duotone', path: '/home' },
  { name: 'tools.http', icon: 'ph:plugs-connected-duotone', path: '/tools/http' },
  { name: 'tools.json', icon: 'ph:brackets-curly-duotone', path: '/tools/json' },
  { name: 'tools.timestamp', icon: 'ph:clock-duotone', path: '/tools/timestamp' },
  { name: 'tools.base64', icon: 'ph:binary-duotone', path: '/tools/base64' },
  { name: 'tools.uuid', icon: 'ph:fingerprint-duotone', path: '/tools/uuid' },
  { name: 'tools.text', icon: 'ph:text-aa-duotone', path: '/tools/text' },
  { name: 'tools.file', icon: 'ph:file-duotone', path: '/tools/file' },
]
</script>

<template>
  <aside class="flex h-dvh flex-col justify-between bg-sidebar px-2 pb-12 pt-2">
    <nav class="grid gap-1">
      <Tooltip v-for="sidebarRoute in sidebarRoutes" :key="sidebarRoute.path">
        <TooltipTrigger as-child>
          <RouterLink :to="sidebarRoute.path">
            <Button
              variant="ghost"
              size="icon"
              :class="sidebarRoute.path === $route.path ? 'bg-muted' : ''"
              class="rounded-lg"
              :aria-label="t(sidebarRoute.name)"
            >
              <Icon :icon="sidebarRoute.icon" class="size-5" />
            </Button>
          </RouterLink>
        </TooltipTrigger>
        <TooltipContent side="right" :side-offset="5">
          {{ t(sidebarRoute.name) }}
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
              <Icon icon="ph:gear-duotone" class="size-5" />
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
