<script setup lang="ts">
import { diffChars, diffLines } from 'diff'
import { computed, ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'

const left = ref('first line\nold value\nlast line')
const right = ref('first line\nnew value\nlast line')
const mode = ref<'lines' | 'chars'>('lines')
const ignoreWhitespace = ref(false)

const changes = computed(() => {
  const oldValue = ignoreWhitespace.value ? left.value.replace(/\s+/g, ' ') : left.value
  const newValue = ignoreWhitespace.value ? right.value.replace(/\s+/g, ' ') : right.value
  return mode.value === 'lines' ? diffLines(oldValue, newValue) : diffChars(oldValue, newValue)
})
</script>

<template>
  <ToolShell title="文本 Diff" desc="按行或字符比较两段文本">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <select v-model="mode" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="lines">
          按行
        </option><option value="chars">
          按字符
        </option>
      </select>
      <label class="flex items-center gap-2 text-sm"><input v-model="ignoreWhitespace" type="checkbox">忽略空白差异</label>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <textarea v-model="left" class="min-h-56 rounded-md border border-input bg-background p-3 font-mono text-sm" placeholder="原文本" />
      <textarea v-model="right" class="min-h-56 rounded-md border border-input bg-background p-3 font-mono text-sm" placeholder="新文本" />
    </div>
    <pre class="mt-3 min-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-mono text-sm"><span v-for="(change, index) in changes" :key="index" :class="change.added ? 'bg-emerald-200 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-100' : change.removed ? 'bg-red-200 text-red-950 line-through dark:bg-red-900 dark:text-red-100' : ''">{{ change.value }}</span></pre>
  </ToolShell>
</template>
