<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useToolboxStore } from '@/stores/toolbox'
import { findToolByPath } from '@/tools/registry'

const commandOpen = ref(false)
const route = useRoute()
const toolbox = useToolboxStore()

void toolbox.initialize()
watch(() => route.path, (path) => {
  const tool = findToolByPath(path)
  if (tool)
    void toolbox.markUsed(tool.id)
}, { immediate: true })
</script>

<template>
  <ConfigProvider>
    <AppTopbar @open-command="commandOpen = true" />
    <TooltipProvider>
      <main class="flex h-[calc(100dvh-2.5rem)] min-h-0">
        <AppSidebar />
        <section class="bg-background min-h-0 grow overflow-auto p-4">
          <router-view />
        </section>
      </main>
    </TooltipProvider>
    <CommandPalette v-model:open="commandOpen" />
  </ConfigProvider>
</template>
