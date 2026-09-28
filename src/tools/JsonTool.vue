<script setup lang="ts">
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

const input = ref('')
const output = ref('')
const error = ref('')
const indent = ref(2)

function formatJson() {
  error.value = ''
  if (!input.value.trim()) {
    output.value = ''
    return
  }
  try {
    output.value = JSON.stringify(JSON.parse(input.value), null, indent.value)
  }
  catch (e) {
    error.value = (e as Error).message
  }
}

function minify() {
  error.value = ''
  try {
    output.value = JSON.stringify(JSON.parse(input.value))
  }
  catch (e) {
    error.value = (e as Error).message
  }
}

async function copyOut() {
  if (output.value)
    await navigator.clipboard.writeText(output.value)
}
</script>

<template>
  <ToolShell title="JSON 格式化 / 校验" desc="格式化、压缩、校验 JSON">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <label class="text-sm text-muted-foreground">缩进</label>
      <select
        v-model.number="indent"
        class="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option :value="2">
          2 空格
        </option>
        <option :value="4">
          4 空格
        </option>
      </select>
      <Button size="sm" @click="formatJson">
        格式化
      </Button>
      <Button size="sm" variant="outline" @click="minify">
        压缩
      </Button>
      <Button size="sm" variant="ghost" @click="copyOut">
        复制
      </Button>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <textarea
        v-model="input"
        class="min-h-[320px] w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="粘贴 JSON 到这里..."
      />
      <textarea
        :value="output"
        readonly
        class="min-h-[320px] w-full resize-y rounded-md border border-input bg-muted/40 p-3 font-mono text-sm outline-none"
        placeholder="结果..."
      />
    </div>
    <p v-if="error" class="mt-2 text-sm text-destructive">
      ⚠ {{ error }}
    </p>
  </ToolShell>
</template>
