<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()

const tools = [
  { path: '/tools/http', titleKey: 'tools.http', descKey: 'tools.httpDesc', icon: '🚀' },
  { path: '/tools/json', titleKey: 'tools.json', descKey: 'tools.jsonDesc', icon: '🧩' },
  { path: '/tools/timestamp', titleKey: 'tools.timestamp', descKey: 'tools.timestampDesc', icon: '⏱' },
  { path: '/tools/base64', titleKey: 'tools.base64', descKey: 'tools.base64Desc', icon: '🔤' },
  { path: '/tools/uuid', titleKey: 'tools.uuid', descKey: 'tools.uuidDesc', icon: '🪪' },
  { path: '/tools/text', titleKey: 'tools.text', descKey: 'tools.textDesc', icon: '📝' },
  { path: '/tools/file', titleKey: 'tools.file', descKey: 'tools.fileDesc', icon: '📁' },
]
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

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="tool in tools"
        :key="tool.path"
        type="button"
        class="rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-accent/40"
        @click="router.push(tool.path)"
      >
        <div class="text-2xl">
          {{ tool.icon }}
        </div>
        <div class="mt-3 font-medium">
          {{ t(tool.titleKey) }}
        </div>
        <div class="mt-1 text-sm text-muted-foreground">
          {{ t(tool.descKey) }}
        </div>
      </button>
    </div>

    <div class="flex gap-2">
      <Button variant="outline" size="sm" @click="router.push('/settings')">
        {{ t('settings.label') }}
      </Button>
    </div>
  </div>
</template>