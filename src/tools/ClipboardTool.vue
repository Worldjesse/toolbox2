<script setup lang="ts">
import { computed, ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

const content = ref('')
const error = ref('')

const detections = computed(() => {
  const value = content.value.trim()
  const items: Array<{ label: string, path: string }> = []
  if (!value)
    return items
  try {
    JSON.parse(value)
    items.push({ label: 'JSON 数据', path: '/tools/json' })
  }
  catch {}
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(value))
    items.push({ label: 'JWT 令牌', path: '/tools/jwt' })
  if (URL.canParse(value))
    items.push({ label: 'URL', path: '/tools/url' })
  if (/^\d{10}(?:\d{3})?$/.test(value))
    items.push({ label: 'Unix 时间戳', path: '/tools/timestamp' })
  if (value.length >= 8 && value.length % 4 === 0 && /^[A-Z0-9+/]+=*$/i.test(value))
    items.push({ label: '可能是 Base64', path: '/tools/base64' })
  return items
})

async function readClipboard() {
  error.value = ''
  try {
    content.value = await navigator.clipboard.readText()
  }
  catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<template>
  <ToolShell title="剪贴板识别" desc="读取当前文本并推荐合适的本地工具，内容不会保存">
    <div class="mb-3 flex gap-2">
      <Button size="sm" @click="readClipboard">
        读取剪贴板
      </Button>
    </div>
    <textarea v-model="content" class="min-h-64 w-full rounded-md border border-input bg-background p-3 font-mono text-sm" placeholder="读取或粘贴文本..." />
    <div class="mt-3 flex flex-wrap gap-2">
      <RouterLink v-for="item in detections" :key="item.path" :to="item.path" class="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
        {{ item.label }} →
      </RouterLink><span v-if="content && !detections.length" class="text-sm text-muted-foreground">未识别出结构化内容</span>
    </div>
    <p v-if="error" class="mt-3 text-sm text-destructive">
      {{ error }}
    </p>
  </ToolShell>
</template>
