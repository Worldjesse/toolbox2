<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { TooltipProvider } from '@/components/ui/tooltip'
</script>

<template>
  <ConfigProvider>
    <AppTopbar />
    <TooltipProvider>
      <main class="flex h-[calc(100dvh-2.5rem)] min-h-0">
        <AppSidebar />
        <section class="bg-background min-h-0 grow overflow-auto p-4">
          <router-view />
        </section>
      </main>
    </TooltipProvider>
  </ConfigProvider>
</template>