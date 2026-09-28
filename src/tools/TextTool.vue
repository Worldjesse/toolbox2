<script setup lang="ts">
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'
import { useToolDraft } from '@/composables/useToolDraft'

const input = useToolDraft('text', 'input', '')
const mode = useToolDraft<'dedupe' | 'sort' | 'sortRev' | 'upper' | 'lower' | 'trim' | 'empty'>('text', 'mode', 'dedupe')
const result = ref('')

function processText() {
  const lines = input.value.split('\n')
  let out: string[]
  switch (mode.value) {
    case 'dedupe':
      out = [...new Set(lines)]
      break
    case 'sort':
      out = [...lines].sort()
      break
    case 'sortRev':
      out = [...lines].sort().reverse()
      break
    case 'upper':
      out = lines.map(l => l.toUpperCase())
      break
    case 'lower':
      out = lines.map(l => l.toLowerCase())
      break
    case 'trim':
      out = lines.map(l => l.trim())
      break
    case 'empty':
      out = lines.filter(l => l.trim() !== '')
      break
    default:
      out = lines
  }
  result.value = out.join('\n')
}

async function copyOut() {
  if (result.value)
    await navigator.clipboard.writeText(result.value)
}
</script>

<template>
  <ToolShell title="文本批处理" desc="按行处理：去重 / 排序 / 大小写 / 去空行">
    <div class="mb-3 flex flex-wrap gap-2">
      <select
        v-model="mode"
        class="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="dedupe">
          去重
        </option>
        <option value="sort">
          排序(A→Z)
        </option>
        <option value="sortRev">
          倒序(Z→A)
        </option>
        <option value="upper">
          转大写
        </option>
        <option value="lower">
          转小写
        </option>
        <option value="trim">
          去除首尾空格
        </option>
        <option value="empty">
          删除空行
        </option>
      </select>
      <Button size="sm" @click="processText">
        处理
      </Button>
      <Button size="sm" variant="ghost" @click="copyOut">
        复制
      </Button>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <textarea
        v-model="input"
        class="min-h-[320px] w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="每行一条..."
      />
      <textarea
        :value="result"
        readonly
        class="min-h-[320px] w-full resize-y rounded-md border border-input bg-muted/40 p-3 font-mono text-sm outline-none"
        placeholder="结果..."
      />
    </div>
  </ToolShell>
</template>
