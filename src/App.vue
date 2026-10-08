<script setup lang="ts">
import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ConfigProvider } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useToolboxStore } from '@/stores/toolbox'
import { findToolByPath } from '@/tools/registry'

const commandOpen = ref(false)
const isMaximized = ref(false)
const route = useRoute()
const toolbox = useToolboxStore()
const isToolRoute = computed(() => route.path.startsWith('/tools/'))
let unlistenResize: UnlistenFn | undefined
let resizeTimer: ReturnType<typeof setTimeout> | undefined

async function syncMaximizedState() {
  try {
    isMaximized.value = await getCurrentWindow().isMaximized()
  }
  catch {
    isMaximized.value = false
  }
}

function scheduleMaximizedSync() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => void syncMaximizedState(), 100)
}

onMounted(async () => {
  await syncMaximizedState()
  try {
    unlistenResize = await getCurrentWindow().onResized(scheduleMaximizedSync)
  }
  catch {
    // Browser preview has no native window API.
  }
})

onBeforeUnmount(() => {
  clearTimeout(resizeTimer)
  unlistenResize?.()
})

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
        <section
          class="min-h-0 grow overflow-auto bg-background"
          :class="isMaximized && isToolRoute
            ? 'p-0 [&_.tool-shell]:rounded-none [&_.tool-shell]:border-0 [&_.tool-shell]:shadow-none'
            : 'p-4 sm:p-5 lg:p-6'"
        >
          <router-view />
        </section>
      </main>
    </TooltipProvider>
    <CommandPalette v-model:open="commandOpen" />
  </ConfigProvider>
</template>
