<script setup lang="ts">
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

const ts = ref<number>(Math.floor(Date.now() / 1000))
const tsResult = ref('')
const dateStr = ref('')
const dateResult = ref('')

function tsToDate() {
  const n = Number(ts.value)
  if (!Number.isFinite(n)) {
    tsResult.value = ''
    return
  }
  const d = new Date(n * 1000)
  tsResult.value = `${d.toLocaleString('zh-CN', { hour12: false })}\nISO: ${d.toISOString()}`
}

function dateToTs() {
  const d = new Date(dateStr.value)
  if (Number.isNaN(d.getTime())) {
    dateResult.value = ''
    return
  }
  dateResult.value = String(Math.floor(d.getTime() / 1000))
}

function setNow() {
  ts.value = Math.floor(Date.now() / 1000)
}
</script>

<template>
  <ToolShell title="时间戳转换" desc="Unix 时间戳 ↔ 本地日期">
    <div class="mb-6 space-y-3">
      <h3 class="text-sm font-medium text-muted-foreground">
        时间戳 → 日期
      </h3>
      <div class="flex flex-wrap gap-2">
        <input
          v-model.number="ts"
          type="number"
          class="h-9 min-w-[200px] flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm"
        >
        <Button size="sm" @click="tsToDate">
          转换
        </Button>
        <Button size="sm" variant="outline" @click="setNow">
          当前
        </Button>
      </div>
      <pre class="min-h-11 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-sm">{{ tsResult || '—' }}</pre>
    </div>

    <div class="space-y-3">
      <h3 class="text-sm font-medium text-muted-foreground">
        日期 → 时间戳
      </h3>
      <div class="flex flex-wrap gap-2">
        <input
          v-model="dateStr"
          placeholder="如 2026-09-24 09:30:00"
          class="h-9 min-w-[200px] flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm"
        >
        <Button size="sm" @click="dateToTs">
          转换
        </Button>
      </div>
      <pre class="min-h-11 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-sm">{{ dateResult || '—' }}</pre>
    </div>
  </ToolShell>
</template>
