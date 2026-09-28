<script setup lang="ts">
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

const count = ref(4)
const list = ref<string[]>([])

function gen() {
  const n = Math.min(Math.max(Number(count.value) || 1, 1), 100)
  const arr: string[] = []
  for (let i = 0; i < n; i++)
    arr.push(crypto.randomUUID())
  list.value = arr
}

async function copyAll() {
  if (list.value.length)
    await navigator.clipboard.writeText(list.value.join('\n'))
}
</script>

<template>
  <ToolShell title="UUID 生成" desc="生成 RFC4122 v4 UUID">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <label class="text-sm text-muted-foreground">数量</label>
      <input
        v-model.number="count"
        type="number"
        min="1"
        max="100"
        class="h-9 w-24 rounded-md border border-input bg-background px-3 font-mono text-sm"
      >
      <Button size="sm" @click="gen">
        生成
      </Button>
      <Button v-if="list.length" size="sm" variant="ghost" @click="copyAll">
        复制全部
      </Button>
    </div>
    <div v-if="list.length" class="flex flex-col gap-2">
      <code
        v-for="(u, i) in list"
        :key="i"
        class="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm"
      >{{ u }}</code>
    </div>
  </ToolShell>
</template>
